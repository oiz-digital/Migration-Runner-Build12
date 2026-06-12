import { useEffect, useRef, useState } from "react";

export interface PriceTick {
  symbol: string;
  usdt: number;
  inr: number;
  change24h: number;
  volume24h: number;
  ts: number;
}

export type PriceMap = Record<string, PriceTick>;

const WS_URL = `wss://${process.env.EXPO_PUBLIC_DOMAIN}/api/ws/prices`;

let globalTicks: PriceTick[] = [];
let globalInrRate = 85;
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
let wsReady = false;

function connectWs() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  ws = new WebSocket(WS_URL);
  ws.onopen = () => { wsReady = true; };
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data as string) as { type?: string; ticks?: PriceTick[]; inrRate?: number };
      if (msg.type === "snapshot" || msg.type === "tick") {
        if (msg.ticks) globalTicks = msg.ticks;
        if (msg.inrRate) globalInrRate = msg.inrRate;
        listeners.forEach((fn) => fn());
      }
    } catch {}
  };
  ws.onclose = () => {
    wsReady = false;
    ws = null;
    setTimeout(connectWs, 3000);
  };
  ws.onerror = () => { ws?.close(); };
}

export function usePrices() {
  const [ticks, setTicks] = useState<PriceTick[]>(globalTicks);
  const [inrRate, setInrRate] = useState(globalInrRate);

  useEffect(() => {
    connectWs();
    const update = () => {
      setTicks([...globalTicks]);
      setInrRate(globalInrRate);
    };
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  const priceMap: PriceMap = {};
  for (const t of ticks) priceMap[t.symbol] = t;

  return { ticks, priceMap, inrRate };
}

export function useTickerForSymbol(base: string, quote: "usdt" | "inr" = "usdt") {
  const { priceMap, inrRate } = usePrices();
  const tick = priceMap[base.toUpperCase()];
  if (!tick) return { price: 0, change24h: 0, inrRate };
  const price = quote === "inr" ? tick.inr : tick.usdt;
  return { price, change24h: tick.change24h, inrRate };
}
