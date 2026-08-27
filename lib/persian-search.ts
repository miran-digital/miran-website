const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

export function normalizePersianSearchText(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("fa")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[يىئ]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[أإٱآ]/g, "ا")
    .replace(/[ةۀ]/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/[‌ـ‐‑‒–—-]/g, "")
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}
