export function customerProfileHref(customerId: string) {
  return `/admin?tab=customers&customer=${encodeURIComponent(customerId)}`;
}

export function adminOrderHref(orderId: string) {
  return `/admin?tab=orders&order=${encodeURIComponent(orderId)}`;
}
