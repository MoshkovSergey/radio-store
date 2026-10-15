'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  clearClientToken,
  clientApi,
  getClientToken,
  setClientToken,
} from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  cartCount: number | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  logout: () => void;
  refreshCartCount: () => Promise<void>;
  addToCart: (productId: number, quantity: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState<number | null>(null);

  const refreshCartCount = useCallback(async () => {
    if (!getClientToken()) {
      setCartCount(null);
      return;
    }

    try {
      const cart = await clientApi.getCart();
      const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      setCartCount(count);
    } catch {
      setCartCount(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!getClientToken()) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      try {
        const currentUser = await clientApi.me();

        if (!cancelled) {
          setUser(currentUser);
        }

        await refreshCartCount();
      } catch {
        clearClientToken();

        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [refreshCartCount]);

  useEffect(() => {
    const handleLogout = () => {
      setUser(null);
      setCartCount(null);
    };

    const handleCartUpdated = () => {
      void refreshCartCount();
    };

    window.addEventListener('auth:logout', handleLogout);
    window.addEventListener('cart:updated', handleCartUpdated);

    return () => {
      window.removeEventListener('auth:logout', handleLogout);
      window.removeEventListener('cart:updated', handleCartUpdated);
    };
  }, [refreshCartCount]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await clientApi.login(email, password);
      setClientToken(response.token);
      setUser(response.user);
      await refreshCartCount();
    },
    [refreshCartCount],
  );

  const register = useCallback(
    async (email: string, password: string, fullName: string) => {
      const response = await clientApi.register(email, password, fullName);
      setClientToken(response.token);
      setUser(response.user);
      await refreshCartCount();
    },
    [refreshCartCount],
  );

  const logout = useCallback(() => {
    clearClientToken();
    setUser(null);
    setCartCount(null);
  }, []);

  const addToCart = useCallback(
    async (productId: number, quantity: number) => {
      await clientApi.addCartItem(productId, quantity);
      await refreshCartCount();
      window.dispatchEvent(new Event('cart:updated'));
    },
    [refreshCartCount],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      cartCount,
      login,
      register,
      logout,
      refreshCartCount,
      addToCart,
    }),
    [
      user,
      loading,
      cartCount,
      login,
      register,
      logout,
      refreshCartCount,
      addToCart,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}