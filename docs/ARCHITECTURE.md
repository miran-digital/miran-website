# معماری Miran Shop

## تصمیم اصلی

Miran Shop یک Modular Monolith روی Cloudflare است. رابط، API و دامنه‌های کسب‌وکار
در یک واحد انتشار قرار دارند، اما هر دامنه از طریق Type، Repository، Validation و
API مشخص مرزبندی می‌شود. وابستگی به D1 و R2 پشت Repositoryها و Runtime Bindingهاست.
در صورت افزایش بار یا تیم، دامنه پرترافیک می‌تواند با قرارداد فعلی به Worker، Queue
یا سرویس مستقل منتقل شود؛ فعلاً هیچ Microservice خالی ساخته نشده است.

## لایه‌ها

1. `app/` مسیرها، صفحات و APIها.
2. `features/` رابط و منطق ارائه هر دامنه.
3. `lib/` قراردادها و سرویس‌های مشترک مانند پول، تاریخ، امنیت و پرداخت.
4. `db/` Repositoryهای D1 و گزارش/پشتیبان.
5. `worker/` ورودی Cloudflare و Security Headerها.
6. `drizzle/` Migrationهای افزایشی و قابل ردیابی.

## وضعیت ۳۰ مرز دامنه

| # | دامنه | وضعیت واقعی |
|---:|---|---|
| ۱ | Identity & Authentication | عملیاتی؛ Sign in with ChatGPT و کنترل سمت سرور |
| ۲ | Customer Accounts | عملیاتی؛ حساب، خروج، نشانی، سفارش، اعلان و پشتیبانی |
| ۳ | Catalog | عملیاتی؛ محصول، SKU، برند، وضعیت نمایش و جزئیات |
| ۴ | Categories | عملیاتی؛ مادر/زیر‌دسته، ترتیب، تصویر و صفحه اختصاصی |
| ۵ | Product Media | عملیاتی؛ تصویر/ویدئو، R2، حذف و Signature |
| ۶ | Pricing & Discounts | عملیاتی؛ Canonical ریال و درصد/مبلغ ثابت |
| ۷ | Promotions | عملیاتی؛ پیام هدر و بنر زمان‌بندی‌شده |
| ۸ | Amazing Offers | عملیاتی؛ زمان‌بندی، تایمر، صفحه و دسته |
| ۹ | Inventory | عملیاتی؛ کل، رزروشده و قابل فروش |
| ۱۰ | Reservations | عملیاتی؛ رزرو اتمیک، انقضا و Rollback |
| ۱۱ | Cart | عملیاتی؛ سبد مهمان و Checkout |
| ۱۲ | Wishlist | عملیاتی؛ علاقه‌مندی محلی مرورگر |
| ۱۳ | Checkout | عملیاتی؛ حساب و نشانی متعلق به مشتری |
| ۱۴ | Orders | عملیاتی؛ Idempotency، Snapshot تحویل و تاریخچه |
| ۱۵ | Payments | Adapter و Callback امن عملیاتی؛ Merchant واقعی تعویقی |
| ۱۶ | Sellers | عملیاتی؛ درخواست، مدارک و پیشنهاد مستقل |
| ۱۷ | Seller Verification | عملیاتی؛ Gate مدارک/ضمانت/قرارداد؛ پرونده قدیمی تعویقی |
| ۱۸ | Shipping | مرز آماده؛ سیاست و اتصال واقعی تعویقی |
| ۱۹ | Returns | مرز آماده؛ سیاست و جریان واقعی تعویقی |
| ۲۰ | Search | عملیاتی؛ نرمال‌سازی فارسی و پیشنهاد جست‌وجو |
| ۲۱ | Content Management | عملیاتی برای محتوای فروشگاه، دسته و کمپین |
| ۲۲ | Banners | عملیاتی؛ دسکتاپ/موبایل، ترتیب، زمان و Alt |
| ۲۳ | Notifications | عملیاتی داخل حساب مشتری |
| ۲۴ | Customer Support | عملیاتی؛ تیکت ایزوله و پاسخ مدیریت |
| ۲۵ | Reviews | عملیاتی؛ خرید تأییدشده و Moderation |
| ۲۶ | SEO | مسیرها و Metadata آماده؛ ایندکس عمداً تعویقی |
| ۲۷ | Analytics & Reporting | گزارش عملیاتی بدون PII؛ رهگیری تبلیغاتی فعال نیست |
| ۲۸ | Audit Logs | عملیاتی برای رخدادهای حساس مدیریت و پرداخت |
| ۲۹ | Fraud & Security | کنترل دسترسی، CSRF/Origin، Rate Limit و File Signature |
| ۳۰ | Backups | خروجی منطقی دستی و Revision موجود؛ زمان‌بندی تعویقی |

## قواعد جداسازی آینده

- هیچ Feature مستقیماً جدول دامنه دیگر را در رابط دست‌کاری نمی‌کند؛ تغییرات از API و
  Repository عبور می‌کنند.
- رخدادهای `order.created`، `payment.succeeded`، `inventory.reserved` و
  `support.updated` نقاط مناسب افزودن Queue در آینده هستند.
- Search Index، Notification Delivery و Media Processing اولین نامزدهای جداسازی
  پس از اثبات نیاز عملیاتی‌اند.
- D1 منبع حقیقت تراکنش‌های فعلی است؛ Cache یا Search آینده نباید منبع حقیقت شود.
