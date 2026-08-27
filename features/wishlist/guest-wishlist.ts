export type GuestWishlist = {
  version: 1;
  productIds: string[];
};

const storageKey = "miran.guest-wishlist.v1";
const wishlistChangeEvent = "miran:wishlist-change";
const itemLimit = 100;

export function createEmptyGuestWishlist(): GuestWishlist {
  return { version: 1, productIds: [] };
}

export function getGuestWishlist(): GuestWishlist {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return createEmptyGuestWishlist();
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("productIds" in parsed) ||
      !Array.isArray(parsed.productIds)
    ) {
      return createEmptyGuestWishlist();
    }
    return {
      version: 1,
      productIds: [
        ...new Set(
          parsed.productIds.filter(
            (item): item is string =>
              typeof item === "string" && item.length > 0 && item.length <= 100,
          ),
        ),
      ].slice(0, itemLimit),
    };
  } catch {
    return createEmptyGuestWishlist();
  }
}

function saveGuestWishlist(wishlist: GuestWishlist) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(wishlist));
  } catch {
    // The page remains usable when browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(wishlistChangeEvent));
  return wishlist;
}

export function subscribeToGuestWishlist(listener: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === storageKey) listener();
  }
  window.addEventListener(wishlistChangeEvent, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(wishlistChangeEvent, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function guestWishlistHas(productId: string) {
  return getGuestWishlist().productIds.includes(productId);
}

export function toggleGuestWishlist(productId: string) {
  const wishlist = getGuestWishlist();
  const exists = wishlist.productIds.includes(productId);
  wishlist.productIds = exists
    ? wishlist.productIds.filter((id) => id !== productId)
    : [...wishlist.productIds, productId].slice(0, itemLimit);
  saveGuestWishlist(wishlist);
  return !exists;
}

export function getGuestWishlistItemCount() {
  return getGuestWishlist().productIds.length;
}
