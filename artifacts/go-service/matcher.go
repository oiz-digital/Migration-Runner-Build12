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

        // Use an explicit level index so we can advance past all-self-trade levels
        // without re-examining them (the old (*levels)[0] approach would have
        // required a break to avoid an infinite loop, but that abandoned valid
        // fills sitting at deeper price levels).
        for lvIdx := 0; remaining > 0 && lvIdx < len(*levels); {
                lv := (*levels)[lvIdx]
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
                        // Remove the now-empty level; next level shifts into lvIdx so
                        // do NOT increment the index.
                        *levels = append((*levels)[:lvIdx], (*levels)[lvIdx+1:]...)
                        continue
                }
                // All orders at this level belong to the taker (self-trade prevention).
                // Advance past this level and keep checking deeper levels — a valid
                // counterparty may exist at the next price level within the taker's
                // limit. Never break here; that would abandon those fills.
                if !progressed {
                        lvIdx++
                        continue
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

// PurgeEmptyBooks removes orderbooks that have no resting orders on either
// side. Called periodically to prevent unbounded memory growth when pairs are
// deactivated or testing pairs are abandoned.
// Returns the number of books purged.
func (e *Engine) PurgeEmptyBooks() int {
        e.mu.Lock()
        defer e.mu.Unlock()
        purged := 0
        for id, bk := range e.books {
                bk.mu.Lock()
                empty := len(bk.Bids) == 0 && len(bk.Asks) == 0
                bk.mu.Unlock()
                if empty {
                        delete(e.books, id)
                        purged++
                }
        }
        return purged
}

// BookCount returns the number of pair orderbooks currently in memory.
func (e *Engine) BookCount() int {
        e.mu.RLock()
        defer e.mu.RUnlock()
        return len(e.books)
}
