export type HeroAction = {
  label: string;
  href: string;
};

export type HeroContent = {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction: HeroAction;
  secondaryAction?: HeroAction;
  mediaLabel: string;
};

export type HomeCategory = {
  id: string;
  name: string;
  href: string;
  itemCountLabel?: string;
  imageUrl?: string;
};

export type HomeBrand = {
  id: string;
  name: string;
  href: string;
  logoUrl?: string;
};

export type HomeBrandSection = {
  title: string;
  description?: string;
  href: string;
  linkLabel: string;
  items: readonly HomeBrand[];
};

export type TrustService = {
  id: string;
  title: string;
  description: string;
  symbol: string;
};

export type HomeContent = {
  hero: HeroContent;
  categories: readonly HomeCategory[];
  brands: HomeBrandSection;
  trustServices: readonly TrustService[];
};

const defaultHomeContent: HomeContent = {
  hero: {
    eyebrow: "Marketplace مدرن Miran",
    title: "خرید ساده‌تر با قیمت و موجودی واقعی",
    description:
      "محصولات منتشرشده، تخفیف‌ها، موجودی، نشانی، روش ارسال و سفارش در Miran از جریان واقعی فروشگاه خوانده و کنترل می‌شوند.",
    primaryAction: { label: "مشاهده پیشنهادهای شگفت‌انگیز", href: "/offers" },
    secondaryAction: { label: "مرور دسته‌بندی‌ها", href: "#categories" },
    mediaLabel: "Miran Marketplace — خرید با Catalog و موجودی واقعی",
  },
  categories: [
    { id: "digital", name: "کالای دیجیتال", href: "/category/digital", itemCountLabel: "موبایل، لپ‌تاپ و لوازم جانبی" },
    { id: "home-kitchen", name: "خانه و آشپزخانه", href: "/category/home-kitchen", itemCountLabel: "لوازم خانه و پخت‌وپز" },
    { id: "fashion", name: "مد و پوشاک", href: "/category/fashion", itemCountLabel: "پوشاک، کفش و اکسسوری" },
    { id: "beauty-health", name: "زیبایی و سلامت", href: "/category/beauty-health", itemCountLabel: "مراقبت شخصی و زیبایی" },
    { id: "sports", name: "ورزش و سفر", href: "/category/sports-travel", itemCountLabel: "ورزشی، کمپ و سفر" },
    { id: "kids", name: "کودک و سرگرمی", href: "/category/kids-entertainment", itemCountLabel: "اسباب‌بازی و محصولات کودک" },
    { id: "automotive", name: "خودرو و ابزار", href: "/category/automotive-tools", itemCountLabel: "لوازم خودرو و ابزار" },
    { id: "grocery", name: "سوپرمارکت", href: "/category/grocery", itemCountLabel: "کالاهای مصرفی روزمره" },
  ],
  brands: {
    title: "برندهای منتخب",
    description: "دسترسی سریع به برندهایی که مشتریان بیشتر دنبال می‌کنند.",
    href: "/brands",
    linkLabel: "مشاهده همه برندها",
    items: [
      { id: "nova", name: "Nova", href: "/brand/nova" },
      { id: "vertex", name: "Vertex", href: "/brand/vertex" },
      { id: "sonic", name: "Sonic", href: "/brand/sonic" },
      { id: "haven", name: "Haven", href: "/brand/haven" },
      { id: "loom", name: "Loom", href: "/brand/loom" },
      { id: "pure", name: "Pure", href: "/brand/pure" },
    ],
  },
  trustServices: [
    { id: "verified-payment", title: "پرداخت تأییدشده", description: "سفارش فقط پس از Verify موفق درگاه به وضعیت پرداخت‌شده می‌رود.", symbol: "تأیید" },
    { id: "real-inventory", title: "موجودی واقعی", description: "موجودی در Checkout دوباره کنترل و برای سفارش در انتظار پرداخت رزرو می‌شود.", symbol: "موجودی" },
    { id: "verified-sellers", title: "فروشندگان بررسی‌شده", description: "مدارک، ضمانت و وضعیت فروشنده پیش از تأیید توسط مدیر کنترل می‌شود.", symbol: "فروشنده" },
    { id: "order-history", title: "پیگیری سفارش", description: "اقلام، نشانی، روش ارسال و وضعیت پرداخت در تاریخچه سفارش قابل مشاهده است.", symbol: "سفارش" },
  ],
};

export async function getHomeContent(): Promise<HomeContent> {
  return defaultHomeContent;
}
