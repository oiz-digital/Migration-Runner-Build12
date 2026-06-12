package main

import (
        "sort"
        "sync"
)

// Side constants
const (
        SideBuy  = "buy"
        SideSell = "sell"
)

// OrderType constants
const (
        OrderLimit  = "limit"
        OrderMarket = "market"
)

// Order is a limit-resting order in the book. Market orders never rest.
type Order struct {
        ID     int64   `json:"id"`
        UserID int64   `json:"userId"`
        Side   string  `json:"side"`
        Price  float64 `json:"price"`
        Qty    float64 `json:"qty"`
        IsBot  bool    `json:"isBot"`
        TS     int64   `json:"ts"` // ns or ms; only used for time-priority ordering
}

// PriceLevel holds a FIFO queue of orders at one price.
type PriceLevel struct {
        Price  float64
        Orders []*Order
}

// totalQty is O(N) but each level is small in practice.
func (l *PriceLevel) totalQty() float64 {
        s := 0.0
        for _, o := range l.Orders {
                s += o.Qty
        }
        return s
}

// OrderBook is a single per-pair in-memory book.
//
//      Bids: descending price (best bid first)
//      Asks: ascending price (best ask first)
type OrderBook struct {
        mu     sync.Mutex
        PairID int64
        Bids   []*PriceLevel
        Asks   []*PriceLevel
        byID   map[int64]*Order // O(1) cancel
}

func NewOrderBook(pairID int64) *OrderBook {
        return &OrderBook{
                PairID: pairID,
                byID:   make(map[int64]*Order),
        }
}

// findLevel returns the level at price (creating it if absent) and whether
// it was newly created. Caller must hold the lock.
func (b *OrderBook) findLevel(side string, price float64) (*PriceLevel, bool) {
        var levels *[]*PriceLevel
        if side == SideBuy {
                levels = &b.Bids
        } else {
                levels = &b.Asks
        }
        for _, l := range *levels {
                if l.Price == price {
                        return l, false
                }
        }
        lv := &PriceLevel{Price: price}
        *levels = append(*levels, lv)
        if side == SideBuy {
                // descending
                sort.SliceStable(*levels, func(i, j int) bool { return (*levels)[i].Price > (*levels)[j].Price })
        } else {
                // ascending
                sort.SliceStable(*levels, func(i, j int) bool { return (*levels)[i].Price < (*levels)[j].Price })
        }
        return lv, true
}

func (b *OrderBook) removeLevel(side string, price float64) {
        var levels *[]*PriceLevel
        if side == SideBuy {
                levels = &b.Bids
        } else {
                levels = &b.Asks
        }
        out := (*levels)[:0]
        for _, l := range *levels {
                if l.Price != price {
                        out = append(out, l)
                }
        }
        *levels = out
}

// Add a resting limit order to the book. Caller must hold the lock.
// Idempotent: if an order with the same ID already exists, the existing one
// is left in place and the new copy is rejected. This keeps re-seeding from
// DB safe across Node restarts when the Go process is still running.
func (b *OrderBook) addRest(o *Order) {
        if _, exists := b.byID[o.ID]; exists {
                return
        }
        lv, _ := b.findLevel(o.Side, o.Price)
        lv.Orders = append(lv.Orders, o)
        b.byID[o.ID] = o
}

// Reset clears every level + index so the pair can be re-seeded fresh.
// Caller must hold the lock.
func (b *OrderBook) reset() {
        b.Bids = nil
        b.Asks = nil
        b.byID = make(map[int64]*Order)
}

// Cancel removes the order if present. Returns the cancelled order or nil.
func (b *OrderBook) Cancel(id int64) *Order {
        b.mu.Lock()
        defer b.mu.Unlock()
        o, ok := b.byID[id]
        if !ok {
                return nil
        }
        delete(b.byID, id)
        var levels *[]*PriceLevel
        if o.Side == SideBuy {
                levels = &b.Bids
        } else {
                levels = &b.Asks
        }
        for _, l := range *levels {
                if l.Price != o.Price {
                        continue
                }
                out := l.Orders[:0]
                for _, x := range l.Orders {
                        if x.ID != id {
                                out = append(out, x)
                        }
                }
                l.Orders = out
                if len(l.Orders) == 0 {
                        b.removeLevel(o.Side, o.Price)
                }
                break
        }
        return o
}

// Snapshot returns aggregated [price, qty] levels up to depth on each side.
func (b *OrderBook) Snapshot(depth int) (bids [][2]float64, asks [][2]float64) {
        b.mu.Lock()
        defer b.mu.Unlock()
        if depth <= 0 {
                depth = 50
        }
        for i, l := range b.Bids {
                if i >= depth {
                        break
                }
                bids = append(bids, [2]float64{l.Price, l.totalQty()})
        }
        for i, l := range b.Asks {
                if i >= depth {
                        break
                }
                asks = append(asks, [2]float64{l.Price, l.totalQty()})
        }
        return
}

// BestBidAsk returns the top-of-book prices (0 when absent).
func (b *OrderBook) BestBidAsk() (float64, float64) {
        b.mu.Lock()
        defer b.mu.Unlock()
        bb, ba := 0.0, 0.0
        if len(b.Bids) > 0 {
                bb = b.Bids[0].Price
        }
        if len(b.Asks) > 0 {
                ba = b.Asks[0].Price
        }
        return bb, ba
}
