export type BankTransferSettings = {
  enabled: boolean;
  cardNumber: string;
  accountHolder: string;
  bankName: string;
  instructions: string;
  reviewHours: number;
};

const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

export function normalizeCardNumber(value: string) {
  return value
    .trim()
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[\s-]/g, "")
    .slice(0, 16);
}

export function isValidIranianCardNumber(value: string) {
  const cardNumber = normalizeCardNumber(value);
  if (!/^\d{16}$/.test(cardNumber) || /^(\d)\1{15}$/.test(cardNumber)) {
    return false;
  }
  const checksum = [...cardNumber].reduce((sum, digit, index) => {
    const weighted = Number(digit) * (index % 2 === 0 ? 2 : 1);
    return sum + (weighted > 9 ? weighted - 9 : weighted);
  }, 0);
  return checksum % 10 === 0;
}

export function isBankTransferConfigured(settings: BankTransferSettings) {
  return (
    settings.enabled &&
    isValidIranianCardNumber(settings.cardNumber) &&
    settings.accountHolder.trim().length >= 3
  );
}

export function formatCardNumber(value: string) {
  return normalizeCardNumber(value).replace(/(\d{4})(?=\d)/g, "$1 ");
}
