import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
const SESSION_KEY = "zebvix_session";
const USER_KEY = "zebvix_user";

export interface ZUser {
  id: number;
  name: string;
  email: string;
  handle?: string;
  kycLevel: number;
  role: string;
  avatar?: string;
  phone?: string;
  twoFaEnabled?: boolean;
  vipTier?: number;
  referralCount?: number;
}

interface AuthState {
  user: ZUser | null;
  session: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function extractSessionFromHeaders(headers: Headers): string | null {
  try {
    const raw = headers.get("set-cookie") ?? headers.get("Set-Cookie") ?? "";
    const match = raw.match(/cx_session=([^;]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const fetchAndUpdateUser = useCallback(async (session: string) => {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: {
          Cookie: `cx_session=${session}`,
          Authorization: `Bearer ${session}`,
        },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json() as { user?: ZUser } | ZUser;
        const userData = (data as any).user ?? (data as ZUser);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
        setState((s) => ({ ...s, user: userData, isAuthenticated: true }));
      } else {
        await AsyncStorage.multiRemove([SESSION_KEY, USER_KEY]);
        setState((s) => ({ ...s, user: null, session: null, isAuthenticated: false }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [session, userJson] = await Promise.all([
          AsyncStorage.getItem(SESSION_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (session) {
          const user = userJson ? (JSON.parse(userJson) as ZUser) : null;
          setState({ user, session, isLoading: false, isAuthenticated: !!user });
          void fetchAndUpdateUser(session);
        } else {
          setState((s) => ({ ...s, isLoading: false }));
        }
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();
  }, [fetchAndUpdateUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
      throw new Error(err.message ?? err.error ?? "Login failed");
    }
    const data = await res.json() as { user?: ZUser; token?: string };
    const user = data.user ?? null;
    const session = data.token ?? extractSessionFromHeaders(res.headers);
    if (session) await AsyncStorage.setItem(SESSION_KEY, session);
    if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({ user, session: session ?? null, isLoading: false, isAuthenticated: !!user });
    if (session) void fetchAndUpdateUser(session);
  }, [fetchAndUpdateUser]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string; error?: string };
      throw new Error(err.message ?? err.error ?? "Registration failed");
    }
    const data = await res.json() as { user?: ZUser; token?: string };
    const user = data.user ?? null;
    const session = data.token ?? extractSessionFromHeaders(res.headers);
    if (session) await AsyncStorage.setItem(SESSION_KEY, session);
    if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({ user, session: session ?? null, isLoading: false, isAuthenticated: !!user });
  }, []);

  const logout = useCallback(async () => {
    const session = state.session;
    if (session) {
      await fetch(`${BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: `cx_session=${session}`,
          Authorization: `Bearer ${session}`,
        },
        credentials: "include",
      }).catch(() => {});
    }
    await AsyncStorage.multiRemove([SESSION_KEY, USER_KEY]);
    setState({ user: null, session: null, isLoading: false, isAuthenticated: false });
  }, [state.session]);

  const refreshUser = useCallback(async () => {
    if (state.session) await fetchAndUpdateUser(state.session);
  }, [state.session, fetchAndUpdateUser]);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
