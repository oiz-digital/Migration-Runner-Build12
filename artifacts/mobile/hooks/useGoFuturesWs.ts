import { useEffect, useRef, useState, useCallback } from "react";

export interface DepthLevel { price: number; qty: number }
export interface FuturesTrade { price: number; qty: number; side: "buy" | "sell"; ts: number }

export interface GoFuturesState {
  bids: DepthLevel[];
  asks: DepthLevel[];
  trades: FuturesTrade[];
  connected: boolean;
  lastPrice: number;
}

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const WS_URL = `wss://${DOMAIN}/go-service/ws`;

export function useGoFuturesWs(pairId: number | null) {
  const [state, setState] = useState<GoFuturesState>({
    bids: [], asks: [], trades: [], connected: false, lastPrice: 0,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePairRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!pairId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (activePairRef.current !== pairId) {
        if (activePairRef.current !== null) {
          wsRef.current.send(JSON.stringify({ type: "unsubscribe", channel: `futures.orderbook:${activePairRef.current}` }));
          wsRef.current.send(JSON.stringify({ type: "unsubscribe", channel: `futures.trades:${activePairRef.current}` }));
        }
        wsRef.current.send(JSON.stringify({ type: "subscribe", channel: `futures.orderbook:${pairId}` }));
        wsRef.current.send(JSON.stringify({ type: "subscribe", channel: `futures.trades:${pairId}` }));
        activePairRef.current = pairId;
      }
      return;
    }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true }));
      ws.send(JSON.stringify({ type: "subscribe", channel: `futures.orderbook:${pairId}` }));
      ws.send(JSON.stringify({ type: "subscribe", channel: `futures.trades:${pairId}` }));
      activePairRef.current = pairId;
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as {
          type: string;
          channel?: string;
          data?: {
            bids?: [number, number][];
            asks?: [number, number][];
            trades?: { price: number; qty: number; side: string; ts: number }[];
          };
        };
        if (msg.type === "update" && msg.channel && msg.data) {
          if (msg.channel.startsWith("futures.orderbook:")) {
            const bids = (msg.data.bids ?? []).map(([price, qty]) => ({ price, qty }));
            const asks = (msg.data.asks ?? []).map(([price, qty]) => ({ price, qty }));
            const lastPrice = bids[0]?.price ?? asks[0]?.price ?? 0;
            setState((s) => ({ ...s, bids, asks, lastPrice }));
          } else if (msg.channel.startsWith("futures.trades:")) {
            const trades = (msg.data.trades ?? []).map((t) => ({
              price: t.price, qty: t.qty,
              side: t.side as "buy" | "sell",
              ts: t.ts,
            }));
            if (trades.length > 0) {
              setState((s) => ({
                ...s,
                trades: [...trades, ...s.trades].slice(0, 30),
                lastPrice: trades[0].price,
              }));
            }
          }
        }
      } catch {}
    };
    ws.onclose = () => {
      setState((s) => ({ ...s, connected: false }));
      activePairRef.current = null;
      reconnectRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => { ws.close(); };
  }, [pairId]);

  const ping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "ping" }));
    }
  }, []);

  useEffect(() => {
    connect();
    const pingInterval = setInterval(ping, 20000);
    return () => {
      clearInterval(pingInterval);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, ping]);

  return state;
}
