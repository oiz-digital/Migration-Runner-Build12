package main

import (
        "sync"
        "time"
)

// Trade is a single fill produced by the matching engine.
type Trade struct {
        TakerOrderID int64   `json:"takerOrderId"`
        MakerOrderID int64   `json:"makerOrderId"`
        TakerUserID  int64   `json:"takerUserId"`
        MakerUserID  int64   `json:"makerUserId"`
        TakerSide    string  `json:"takerSide"`
        Price        float64 `json:"price"`
        Qty          float64 `json:"qty"`
        MakerIsBot   bool    `json:"makerIsBot"`
        TakerIsBot   bool    `json:"takerIsBot"`
        TS           int64   `json:"ts"`
}

// MatchResult is what the HTTP /internal/futures/place returns.
type MatchResult struct {
        OrderID   int64   `json:"orderId"`
        Status    string  `json:"status"`    // FILLED | PARTIAL | OPEN | REJECTED
        Filled    float64 `json:"filledQty"` // total filled this call
        Remaining float64 `json:"remaining"` // remaining qty (>0 means resting on book or rejected for market)
        AvgPrice  float64 `json:"avgPrice"`  // VWAP of fills
        Trades    []Trade `json:"trades"`
}

// Engine owns one orderbook per pair.
type Engine struct {
        mu    sync.RWMutex
        books map[int64]*OrderBook
}

func NewEngine() *Engine { return &Engine{books: map[int64]*OrderBook{}} }

func (e *Engine) book(pairID int64) *OrderBook {
        e.mu.RLock()
        b, ok := e.books[pairID]
        e.mu.RUnlock()
        if ok {
                return b
        }
        e.mu.Lock()
        defer e.mu.Unlock()
        if b, ok := e.books[pairID]; ok {
                return b
        }
        b = NewOrderBook(pairID)
        e.books[pairID] = b
        return b
}

// Place runs the matcher for a single incoming order. It does NOT touch the
// DB — the Node side is responsible for persistence and wallet settlement.
//
// Self-trade is prevented: if the would-be maker has the same userId as the
// taker, that maker is removed from the book and skipped (taker keeps trying).
func (e *Engine) Place(pairID int64, taker *Order, orderType string) MatchResult {
        bk := e.book(pairID)
        bk.mu.Lock()
        defer bk.mu.Unlock()

        res := MatchResult{OrderID: taker.ID}
        remaining := taker.Qty
        filledNotional := 0.0

        // Walk the opposite side, best price first.
        var levels *[]*PriceLevel
        if taker.Side == SideBuy {
                levels = &bk.Asks
        } else {
                levels = &bk.Bids
        }

        for remaining > 0 && len(*levels) > 0 {
                lv := (*levels)[0]
                // Limit price gating
                if orderType == OrderLimit {
                        if taker.Side == SideBuy && taker.Price < lv.Price {
                                break
                        }
                        if taker.Side == SideSell && taker.Price > lv.Price {
                                break
                        }
                }
                // Walk FIFO at this level.
                out := lv.Orders[:0]
                progressed := false
                for _, maker := range lv.Orders {
                        if remaining <= 0 {
                                out = append(out, maker)
                                continue
                        }
                        // Self-trade prevention: SKIP this maker (do NOT delete it
                        // from the book — the maker order still belongs to the user
                        // in the DB and should be cancellable normally).
                        if maker.UserID == taker.UserID && taker.UserID != 0 {
                                out = append(out, maker)
                                continue
                        }
                        fillQty := maker.Qty
                        if remaining < fillQty {
                                fillQty = remaining
                        }
                        tr := Trade{
                                TakerOrderID: taker.ID,
                                MakerOrderID: maker.ID,
                                TakerUserID:  taker.UserID,
                                MakerUserID:  maker.UserID,
                                TakerSide:    taker.Side,
                                Price:        lv.Price,
                                Qty:          fillQty,
                                MakerIsBot:   maker.IsBot,
                                TakerIsBot:   taker.IsBot,
                                TS:           time.Now().UnixMilli(),
                        }
                        res.Trades = append(res.Trades, tr)
                        filledNotional += fillQty * lv.Price
                        remaining -= fillQty
                        maker.Qty -= fillQty
                        progressed = true
                        if maker.Qty > 0 {
                                out = append(out, maker)
                        } else {
                                delete(bk.byID, maker.ID)
                        }
                }
                lv.Orders = out
                if len(lv.Orders) == 0 {
                        // remove empty top level
                        *levels = (*levels)[1:]
                        continue
                }
                // If no fills happened and the level still has orders, the
                // remaining makers all belong to the taker (self-trade skip).
                // Stop matching — we can't pop the level (those orders are real)
                // and re-evaluating it would loop forever. The taker either
                // rests (limit) or is REJECTED (market) below.
                if !progressed {
                        break
                }
        }

        res.Filled = taker.Qty - remaining
        res.Remaining = remaining
        if res.Filled > 0 {
                res.AvgPrice = filledNotional / res.Filled
        }

        if remaining > 0 && orderType == OrderLimit {
                // Rest the unfilled remainder.
                rest := &Order{
                        ID:     taker.ID,
                        UserID: taker.UserID,
                        Side:   taker.Side,
                        Price:  taker.Price,
                        Qty:    remaining,
                        IsBot:  taker.IsBot,
                        TS:     taker.TS,
                }
                bk.addRest(rest)
                if res.Filled == 0 {
                        res.Status = "OPEN"
                } else {
                        res.Status = "PARTIAL"
                }
        } else if remaining > 0 {
                // Market order with no liquidity for the remaining qty.
                if res.Filled == 0 {
                        res.Status = "REJECTED"
                } else {
                        res.Status = "PARTIAL"
                }
        } else {
                res.Status = "FILLED"
        }
        return res
}

// Cancel removes the order with the given id from the given pair's book.
func (e *Engine) Cancel(pairID, orderID int64) bool {
        bk := e.book(pairID)
        o := bk.Cancel(orderID)
        return o != nil
}

// SeedRest pushes a previously-persisted resting order into the book without
// running matching. Used at startup to restore state from the DB.
// addRest is idempotent so repeated seeds with the same orderId are safe.
func (e *Engine) SeedRest(pairID int64, o *Order) {
        bk := e.book(pairID)
        bk.mu.Lock()
        defer bk.mu.Unlock()
        bk.addRest(o)
}

// ResetBook clears every level + index for a pair. Used before bulk re-seeding
// to guarantee a clean slate even when the Go process is older than Node.
func (e *Engine) ResetBook(pairID int64) {
        bk := e.book(pairID)
        bk.mu.Lock()
        defer bk.mu.Unlock()
        bk.reset()
}

// Snapshot returns aggregated bids/asks for a pair.
func (e *Engine) Snapshot(pairID int64, depth int) ([][2]float64, [][2]float64) {
        return e.book(pairID).Snapshot(depth)
}
