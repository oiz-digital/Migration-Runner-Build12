package main

import (
        "encoding/json"
        "net/http"
        "strconv"
)

// JSON helper.
func writeJSON(w http.ResponseWriter, status int, body any) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(status)
        _ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
        writeJSON(w, status, map[string]any{"error": msg})
}

// ── /internal/futures/place ────────────────────────────────────────────────
type placeReq struct {
        OrderID int64   `json:"orderId"`
        UserID  int64   `json:"userId"`
        PairID  int64   `json:"pairId"`
        Side    string  `json:"side"` // buy | sell
        Type    string  `json:"type"` // limit | market
        Price   float64 `json:"price"`
        Qty     float64 `json:"qty"`
        IsBot   bool    `json:"isBot"`
}

func (s *Server) handlePlace(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
                writeErr(w, 405, "method not allowed")
                return
        }
        var req placeReq
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeErr(w, 400, "bad json: "+err.Error())
                return
        }
        if req.PairID <= 0 || req.OrderID <= 0 {
                writeErr(w, 400, "pairId and orderId required")
                return
        }
        if req.Side != SideBuy && req.Side != SideSell {
                writeErr(w, 400, "side must be 'buy' or 'sell'")
                return
        }
        if req.Type != OrderLimit && req.Type != OrderMarket {
                writeErr(w, 400, "type must be 'limit' or 'market'")
                return
        }
        if req.Qty <= 0 {
                writeErr(w, 400, "qty must be > 0")
                return
        }
        if req.Type == OrderLimit && req.Price <= 0 {
                writeErr(w, 400, "limit order requires price > 0")
                return
        }
        res := s.engine.Place(req.PairID, &Order{
                ID:     req.OrderID,
                UserID: req.UserID,
                Side:   req.Side,
                Price:  req.Price,
                Qty:    req.Qty,
                IsBot:  req.IsBot,
                TS:     0,
        }, req.Type)

        // Fire-and-forget WS broadcasts for trades + book updates.
        if len(res.Trades) > 0 {
                s.broadcast("futures.trades:"+strconv.FormatInt(req.PairID, 10), map[string]any{
                        "pairId": req.PairID, "trades": res.Trades,
                })
        }
        bids, asks := s.engine.Snapshot(req.PairID, 50)
        s.broadcast("futures.orderbook:"+strconv.FormatInt(req.PairID, 10), map[string]any{
                "pairId": req.PairID, "bids": bids, "asks": asks,
        })

        writeJSON(w, 200, res)
}

// ── /internal/futures/cancel ───────────────────────────────────────────────
type cancelReq struct {
        OrderID int64 `json:"orderId"`
        PairID  int64 `json:"pairId"`
}

func (s *Server) handleCancel(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
                writeErr(w, 405, "method not allowed")
                return
        }
        var req cancelReq
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeErr(w, 400, "bad json")
                return
        }
        ok := s.engine.Cancel(req.PairID, req.OrderID)
        bids, asks := s.engine.Snapshot(req.PairID, 50)
        s.broadcast("futures.orderbook:"+strconv.FormatInt(req.PairID, 10), map[string]any{
                "pairId": req.PairID, "bids": bids, "asks": asks,
        })
        writeJSON(w, 200, map[string]any{"cancelled": ok})
}

// ── /internal/futures/seed ─────────────────────────────────────────────────
// Bulk-restore resting orders without matching. Idempotent on the caller side
// (caller dedupes by orderId).
type seedReq struct {
        PairID int64    `json:"pairId"`
        Orders []*Order `json:"orders"`
        Reset  bool     `json:"reset"` // when true, wipe the pair's book before seeding
}

func (s *Server) handleSeed(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
                writeErr(w, 405, "method not allowed")
                return
        }
        var req seedReq
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                writeErr(w, 400, "bad json")
                return
        }
        if req.Reset {
                s.engine.ResetBook(req.PairID)
        }
        for _, o := range req.Orders {
                if o == nil || o.ID == 0 || o.Qty <= 0 {
                        continue
                }
                if o.Side != SideBuy && o.Side != SideSell {
                        continue
                }
                s.engine.SeedRest(req.PairID, o)
        }
        bids, asks := s.engine.Snapshot(req.PairID, 50)
        writeJSON(w, 200, map[string]any{"seeded": len(req.Orders), "bids": len(bids), "asks": len(asks)})
}

// ── /internal/futures/snapshot?pairId=X&depth=20 ───────────────────────────
func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
        pid, _ := strconv.ParseInt(r.URL.Query().Get("pairId"), 10, 64)
        depth, _ := strconv.Atoi(r.URL.Query().Get("depth"))
        if pid <= 0 {
                writeErr(w, 400, "pairId required")
                return
        }
        if depth <= 0 {
                depth = 20
        }
        bids, asks := s.engine.Snapshot(pid, depth)
        writeJSON(w, 200, map[string]any{"pairId": pid, "bids": bids, "asks": asks})
}
