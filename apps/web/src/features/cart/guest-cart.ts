export type GuestCartLineInput = {
  productId: string;
  slug: string;
  title: string;
  mediaLabel: string;
  unitPriceMinor: number;
  currency: string;
  quantity: number;
};

export type GuestCartLine = GuestCartLineInput & {
  quantity: number;
};

export type GuestCart = {
  version: 1;
  lines: GuestCartLine[];
};

const storageKey = "miran.guest-cart.v1";
const cartChangeEvent = "miran:cart-change";
export const guestCartQuantityLimit = 10;

export function createEmptyGuestCart(): GuestCart {
  return { version: 1, lines: [] };
}

function isGuestCartLine(value: unknown): value is GuestCartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.productId === "string" &&
    typeof line.slug === "string" &&
    typeof line.title === "string" &&
    typeof line.mediaLabel === "string" &&
    typeof line.unitPriceMinor === "number" &&
    Number.isSafeInteger(line.unitPriceMinor) &&
    line.unitPriceMinor >= 0 &&
    typeof line.currency === "string" &&
    typeof line.quantity === "number" &&
    Number.isSafeInteger(line.quantity) &&
    line.quantity >= 1 &&
    line.quantity <= guestCartQuantityLimit
  );
}

export function getGuestCart(): GuestCart {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return createEmptyGuestCart();
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("lines" in parsed) ||
      !Array.isArray(parsed.lines)
    ) {
      return createEmptyGuestCart();
    }
    return {
      version: 1,
      lines: parsed.lines.filter(isGuestCartLine),
    };
  } catch {
    return createEmptyGuestCart();
  }
}

function getItemCount(cart: GuestCart) {
  return cart.lines.reduce((total, line) => total + line.quantity, 0);
}

export function getGuestCartItemCount() {
  return getItemCount(getGuestCart());
}

function saveGuestCart(cart: GuestCart) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(cart));
  } catch {
    // The page remains usable when browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(cartChangeEvent));
  return cart;
}

export function subscribeToGuestCart(listener: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === storageKey) listener();
  }

  window.addEventListener(cartChangeEvent, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(cartChangeEvent, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function addGuestCartLine(input: GuestCartLineInput) {
  const quantity = Math.min(
    guestCartQuantityLimit,
    Math.max(1, Math.trunc(input.quantity)),
  );
  const cart = getGuestCart();
  const existing = cart.lines.find(
    (line) => line.productId === input.productId,
  );

  if (existing) {
    existing.quantity = Math.min(
      guestCartQuantityLimit,
      existing.quantity + quantity,
    );
  } else {
    cart.lines.push({ ...input, quantity });
  }

  return getItemCount(saveGuestCart(cart));
}

export function updateGuestCartLine(productId: string, quantity: number) {
  const cart = getGuestCart();
  const line = cart.lines.find((item) => item.productId === productId);
  if (!line) return cart;

  const nextQuantity = Math.trunc(quantity);
  if (nextQuantity < 1) {
    cart.lines = cart.lines.filter((item) => item.productId !== productId);
  } else {
    line.quantity = Math.min(guestCartQuantityLimit, nextQuantity);
  }
  return saveGuestCart(cart);
}

export function removeGuestCartLine(productId: string) {
  const cart = getGuestCart();
  cart.lines = cart.lines.filter((line) => line.productId !== productId);
  return saveGuestCart(cart);
}

export function clearGuestCart() {
  return saveGuestCart(createEmptyGuestCart());
}
