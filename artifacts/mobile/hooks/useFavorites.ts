import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const KEY = "zebvix_favorites_v1";

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) {
        try { setFavorites(new Set(JSON.parse(raw) as string[])); } catch { /* empty */ }
      }
      setLoaded(true);
    });
  }, []);

  const save = useCallback(async (next: Set<string>) => {
    setFavorites(new Set(next));
    await AsyncStorage.setItem(KEY, JSON.stringify([...next]));
  }, []);

  const toggle = useCallback((symbol: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      void AsyncStorage.setItem(KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const isFav = useCallback((symbol: string) => favorites.has(symbol), [favorites]);

  return { favorites, toggle, isFav, loaded, save };
}
