export type GuestCartLineInput = {
  productId: string;
  slug: string;
  title: string;
  mediaLabel: string;
  unitPriceMinor: number;
  currency: string;
  quantity: number;
};

type GuestCartLine = GuestCartLineInput & {
  quantity: number;
};

type GuestCart = {
  version: 1;
  lines: GuestCartLine[];
};

const storageKey = "miran.guest-cart.v1";

function emptyCart(): GuestCart {
  return { version: 1, lines: [] };
}

function readCart(): GuestCart {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return emptyCart();
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("lines" in parsed) ||
      !Array.isArray(parsed.lines)
    ) {
      return emptyCart();
    }
    return parsed as GuestCart;
  } catch {
    return emptyCart();
  }
}

export function addGuestCartLine(input: GuestCartLineInput) {
  const quantity = Math.min(10, Math.max(1, Math.trunc(input.quantity)));
  const cart = readCart();
  const existing = cart.lines.find(
    (line) => line.productId === input.productId,
  );

  if (existing) {
    existing.quantity = Math.min(10, existing.quantity + quantity);
  } else {
    cart.lines.push({ ...input, quantity });
  }

  window.localStorage.setItem(storageKey, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent("miran:cart-change"));
  return cart.lines.reduce((total, line) => total + line.quantity, 0);
}
