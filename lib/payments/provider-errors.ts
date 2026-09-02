export class PaymentProviderError extends Error {
  readonly providerCode?: number;
  readonly providerStatus?: number;

  constructor(message: string, providerCode?: number, providerStatus?: number) {
    super(message);
    this.name = "PaymentProviderError";
    this.providerCode = providerCode;
    this.providerStatus = providerStatus;
  }
}

export function getPaymentProviderUserMessage(error: unknown) {
  if (!(error instanceof PaymentProviderError)) return "شروع پرداخت ممکن نشد؛ کمی بعد دوباره تلاش کنید.";
  if (error.message === "PAYMENT_CONNECTION_FAILED") {
    return "پاسخی از درگاه دریافت نشد؛ روش پرداخت دیگری انتخاب کنید یا کمی بعد دوباره تلاش کنید.";
  }
  if (error.message === "PAYMENT_PROVIDER_NOT_CONFIGURED" || error.message === "PAYMENT_PROVIDER_NOT_INTEGRATED") {
    return "این درگاه اکنون در دسترس نیست؛ روش پرداخت دیگری انتخاب کنید.";
  }
  switch (error.providerCode) {
    case -9: return "اطلاعات پرداخت برای زرین‌پال معتبر نیست؛ تنظیمات درگاه باید بررسی شود.";
    case -11: return "درگاه زرین‌پال این فروشگاه هنوز فعال نیست.";
    case -12: return "تعداد تلاش‌های پرداخت زیاد شده است؛ کمی بعد دوباره تلاش کنید.";
    case -13:
    case -17:
    case -19: return "حساب پذیرندهٔ زرین‌پال محدود است؛ روش پرداخت دیگری انتخاب کنید.";
    case -18: return "دامنهٔ فروشگاه با دامنهٔ ثبت‌شده در زرین‌پال یکسان نیست.";
    default: return error.message === "PAYMENT_VERIFY_REJECTED"
      ? "تأیید پرداخت نهایی نشد؛ در صورت کسر وجه با شماره سفارش پیگیری کنید."
      : "درگاه درخواست پرداخت را نپذیرفت؛ روش پرداخت دیگری انتخاب کنید.";
  }
}
