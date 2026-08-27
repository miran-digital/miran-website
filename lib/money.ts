export const IRAN_CURRENCY = "IRR" as const;

export type IranPriceUnit = "toman" | "rial";

export type DeliveryFeeSettings = {
  standardRial: number;
  priorityRial: number;
};

export const defaultDeliveryFees: DeliveryFeeSettings = {
  standardRial: 500_000,
  priorityRial: 1_000_000,
};

const LEGACY_PRICE_SCALE = 10_000;

export function getCurrencyMinorDigits(currency: string) {
  return currency === IRAN_CURRENCY ? 0 : 2;
}

/** Prices are stored canonically as whole rials. */
export function majorToMinor(amount: number, currency: string = IRAN_CURRENCY) {
  return currency === IRAN_CURRENCY
    ? Math.round(amount * 10)
    : Math.round(amount * 10 ** getCurrencyMinorDigits(currency));
}

/** Admin-facing major amounts are toman for readable inputs and filters. */
export function minorToMajor(
  amountMinor: number,
  currency: string = IRAN_CURRENCY,
) {
  return currency === IRAN_CURRENCY
    ? amountMinor / 10
    : amountMinor / 10 ** getCurrencyMinorDigits(currency);
}

export function priceInputToRial(amount: number, unit: IranPriceUnit) {
  return Math.max(0, Math.round(unit === "toman" ? amount * 10 : amount));
}

export function rialToPriceInput(amountRial: number, unit: IranPriceUnit) {
  return unit === "toman" ? amountRial / 10 : amountRial;
}

/**
 * Older saved rows used foreign-currency minor units. This deterministic scale
 * preserves their relative values while moving the storefront to one IRR
 * ledger. Once a value is saved as IRR it is not converted again.
 */
export function normalizeLegacyPriceToRial(
  amountMinor: number,
  currency: string,
) {
  if (!Number.isFinite(amountMinor)) return 0;
  if (currency === IRAN_CURRENCY) return Math.max(0, Math.round(amountMinor));
  return Math.max(0, Math.round(amountMinor * LEGACY_PRICE_SCALE));
}

export function formatMoney(
  amountMinor: number,
  currency: string = IRAN_CURRENCY,
  locale = "fa-IR",
) {
  const amountRial = normalizeLegacyPriceToRial(amountMinor, currency);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    amountRial / 10,
  )} تومان`;
}

export function formatRialReference(amountRial: number, locale = "fa-IR") {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    amountRial,
  )} ریال`;
}

export function getDeliveryPriceMinor(
  _currency: string,
  delivery: "standard" | "priority",
  fees: DeliveryFeeSettings = defaultDeliveryFees,
) {
  const amount = delivery === "priority" ? fees.priorityRial : fees.standardRial;
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
}
