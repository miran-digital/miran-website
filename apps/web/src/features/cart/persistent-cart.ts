"use client";

import {
  addGuestCartLine,
  clearGuestCart,
  getGuestCart,
  type GuestCartLineInput,
} from "./guest-cart";

export type ServerCartLine = {
  productId: string;
  slug: string;
  title: string;
  quantity: number;
  pricing: {
    baseIrr: number;
    finalIrr: number;
    discountIrr: number;
  };
  currency: "IRR";
  available: boolean;
  availableQuantity: number;
  primaryImageUrl: string | null;
};

export type ServerCart = {
  id: string;
  lines: ServerCartLine[];
  itemCount: number;
  subtotalIrr: number;
  discountIrr: number;
  totalIrr: number;
  currency: "IRR";
};

type CartResponse = { cart?: ServerCart; error?: string; message?: string };

const serverCartChangeEvent = "miran:server-cart-change";
let guestMergeInFlight: Promise<ServerCart | null> | null = null;

function broadcast(cart: ServerCart) {
  window.dispatchEvent(new CustomEvent(serverCartChangeEvent, { detail: cart }));
  return cart;
}

async function parseCart(response: Response) {
  const data = (await response.json()) as CartResponse;
  if (!response.ok || !data.cart) {
    const error = new Error(data.message || "سبد خرید از سرور دریافت نشد.");
    Object.assign(error, { status: response.status, code: data.error });
    throw error;
  }
  return data.cart;
}

export function subscribeToServerCart(listener: (cart?: ServerCart) => void) {
  const handle = (event: Event) => {
    const cart = (event as CustomEvent<ServerCart>).detail;
    listener(cart);
  };
  window.addEventListener(serverCartChangeEvent, handle);
  return () => window.removeEventListener(serverCartChangeEvent, handle);
}

export async function getServerCart() {
  return parseCart(await fetch("/api/cart", { cache: "no-store" }));
}

export async function syncGuestCartToServer(): Promise<ServerCart | null> {
  if (guestMergeInFlight) return guestMergeInFlight;
  guestMergeInFlight = (async () => {
    const guest = getGuestCart();
    if (guest.lines.length === 0) {
      const response = await fetch("/api/cart", { cache: "no-store" });
      if (response.status === 401) return null;
      return broadcast(await parseCart(response));
    }

    const response = await fetch("/api/cart/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: guest.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
      }),
    });
    if (response.status === 401) return null;
    const cart = await parseCart(response);
    clearGuestCart();
    return broadcast(cart);
  })();

  try {
    return await guestMergeInFlight;
  } finally {
    guestMergeInFlight = null;
  }
}

export async function addCartLinePreferServer(input: GuestCartLineInput) {
  const response = await fetch("/api/cart/merge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      items: [{ productId: input.productId, quantity: input.quantity }],
    }),
  });
  if (response.status === 401) {
    return {
      mode: "guest" as const,
      itemCount: addGuestCartLine(input),
      cart: null,
    };
  }
  const cart = broadcast(await parseCart(response));
  return { mode: "server" as const, itemCount: cart.itemCount, cart };
}

export async function setServerCartLine(productId: string, quantity: number) {
  const response = await fetch(`/api/cart/items/${encodeURIComponent(productId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quantity }),
  });
  return broadcast(await parseCart(response));
}

export async function removeServerCartLine(productId: string) {
  const response = await fetch(`/api/cart/items/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
  return broadcast(await parseCart(response));
}

export async function clearServerCart() {
  return broadcast(await parseCart(await fetch("/api/cart", { method: "DELETE" })));
}
