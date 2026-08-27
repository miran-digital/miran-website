# Miran Shop

فروشگاه اینترنتی فارسی MIRAN با Next.js/React، TypeScript، Cloudflare Sites/Workers،
D1، R2 و Drizzle. پروژه به‌صورت **Modular Monolith** ساخته شده است: مرزهای دامنه
روشن‌اند و در صورت رشد واقعی می‌توان هر دامنه را بدون ساخت سرویس‌های خالی جدا کرد.

## اجرای محلی

پیش‌نیاز: Node.js `>=22.13.0`.

```bash
npm run install:ci
npm run dev
```

فرمان‌های کنترل کیفیت:

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

## زیرساخت

- احراز هویت مشتری: ایمیل و رمز مستقل با Supabase Auth؛ رمز عبور در Miran Shop ذخیره نمی‌شود.
- احراز هویت مدیریت: حساب مالک ChatGPT و نقش‌های مجاز، جدا از حساب مشتری.
- داده عملیاتی: Cloudflare D1 با Migrationهای افزایشی Drizzle.
- رسانه: Cloudflare R2 با محدودیت حجم و بررسی Signature واقعی فایل.
- انتشار: OpenAI Sites روی Cloudflare Worker.
- مبلغ Canonical: ریال؛ نمایش تومان و معادل ریال در رابط.
- زمان Canonical: UTC/ISO؛ نمایش شمسی/میلادی بر اساس تنظیم مالک و ساعت ایران.

فایل `.openai/hosting.json` شناسه پروژه و Bindingها را نگه می‌دارد. این مخزن را
به پروژه Sites دیگری متصل نکنید و D1 را Reset نکنید.

## امنیت

APIهای خصوصی در سمت سرور هویت و مالکیت داده را بررسی می‌کنند. Mutationها دارای
کنترل Origin/Sec-Fetch-Site هستند و مسیرهای حساس Rate Limit پایدار D1 دارند.
فایل‌ها بر اساس نوع واقعی، اندازه و Signature بررسی می‌شوند. CSP، HSTS،
X-Content-Type-Options، Frame Protection و Permissions Policy در Worker اعمال می‌شوند.

هیچ Secret، Merchant ID یا شماره کارت واقعی نباید در Git ثبت شود. Merchant ID
زرین‌پال فقط به‌صورت Environment Secret و شماره کارت فقط از پنل مالک تنظیم می‌شود.

## پشتیبان و بازگشت

مالک می‌تواند از پنل، خروجی منطقی تمام جدول‌های D1 را دریافت کند. نسخه‌های تنظیمات
فروشگاه نیز قابل مشاهده و بازگردانی هستند. فایل‌های R2 باید جداگانه نسخه‌برداری شوند.
راهنمای دقیق در `docs/RESTORE_GUIDE_FA.md` است.

## وضعیت انتشار

وضعیت دقیق آخرین تحویل، تست‌ها و موارد تعویقی در `docs/FINAL_HANDOVER_FA.md` ثبت
می‌شود. پرداخت واقعی، سیاست ارسال/مرجوعی، تصاویر واقعی کالا و ایندکس گوگل تا زمان
ارائه اطلاعات نهایی مالک، کامل یا فعال معرفی نمی‌شوند.
