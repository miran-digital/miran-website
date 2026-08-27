"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { PublicStorefrontState } from "./public-storefront";
import { loadPublicStorefrontState } from "./admin-store";

const PublicStorefrontContext = createContext<PublicStorefrontState | null>(null);

export function PublicStorefrontProvider({
  initialState,
  children,
}: {
  initialState: PublicStorefrontState;
  children: ReactNode;
}) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadPublicStorefrontState()
        .then((next) => {
          if (active) setState(next);
        })
        .catch(() => {
          // Keep the server-rendered state during a temporary refresh failure.
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return (
    <PublicStorefrontContext.Provider value={state}>
      {children}
    </PublicStorefrontContext.Provider>
  );
}

export function usePublicStorefrontState() {
  const state = useContext(PublicStorefrontContext);
  if (!state) {
    throw new Error("PUBLIC_STOREFRONT_PROVIDER_MISSING");
  }
  return state;
}
