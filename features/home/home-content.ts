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
  imagePreset?: string;
  imageHidden?: boolean;
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

const mockHomeContent: HomeContent = {
  hero: {
    eyebrow: "خرید هوشمند با Miran Shop",
    title: "کالاهای منتخب برای خریدی سریع، ساده و مطمئن",
    description:
      "یک Marketplace مدرن با جست‌وجوی سریع، دسته‌بندی روشن و تجربه خرید بهینه برای موبایل و دسکتاپ.",
    primaryAction: { label: "مشاهده شگفت‌انگیزها", href: "/offers" },
    secondaryAction: { label: "مرور دسته‌بندی‌ها", href: "#categories" },
    mediaLabel: "ویترین رنگی و هوشمند Miran Shop",
  },
  categories: [
    {
      id: "digital",
      name: "کالای دیجیتال",
      href: "/category/digital",
      itemCountLabel: "موبایل، لپ‌تاپ و لوازم جانبی",
      imagePreset: "digital",
    },
    {
      id: "home-kitchen",
      name: "خانه و آشپزخانه",
      href: "/category/home-kitchen",
      itemCountLabel: "لوازم خانه و پخت‌وپز",
      imagePreset: "home-kitchen",
    },
    {
      id: "fashion",
      name: "مد و پوشاک",
      href: "/category/fashion",
      itemCountLabel: "پوشاک، کفش و اکسسوری",
      imagePreset: "fashion",
    },
    {
      id: "beauty-health",
      name: "زیبایی و سلامت",
      href: "/category/beauty-health",
      itemCountLabel: "مراقبت شخصی و زیبایی",
      imagePreset: "beauty-health",
    },
    {
      id: "sports",
      name: "ورزش و سفر",
      href: "/category/sports-travel",
      itemCountLabel: "ورزشی، کمپ و سفر",
      imagePreset: "sports-travel",
    },
    {
      id: "kids",
      name: "کودک و سرگرمی",
      href: "/category/kids-entertainment",
      itemCountLabel: "اسباب‌بازی و محصولات کودک",
      imagePreset: "kids-entertainment",
    },
    {
      id: "automotive",
      name: "خودرو و ابزار",
      href: "/category/automotive-tools",
      itemCountLabel: "لوازم خودرو و ابزار",
      imagePreset: "automotive-tools",
    },
    {
      id: "grocery",
      name: "سوپرمارکت",
      href: "/category/grocery",
      itemCountLabel: "کالاهای مصرفی روزمره",
      imagePreset: "grocery",
    },
    {
      id: "tobacco",
      name: "دخانیات",
      href: "/category/tobacco",
      itemCountLabel: "دستهٔ مادر آماده برای زیردسته‌های مدیر",
      imageHidden: true,
    },
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
    {
      id: "secure-payment",
      title: "پرداخت امن",
      description: "فرایند پرداخت شفاف و آماده اتصال به درگاه‌های امن.",
      symbol: "امن",
    },
    {
      id: "fast-delivery",
      title: "ارسال سریع",
      description: "ساختار آماده برای روش‌های ارسال و رهگیری سفارش.",
      symbol: "سریع",
    },
    {
      id: "support",
      title: "پشتیبانی پاسخ‌گو",
      description: "مسیر روشن برای دریافت کمک قبل و بعد از خرید.",
      symbol: "۲۴/۷",
    },
    {
      id: "returns",
      title: "مرجوعی شفاف",
      description: "قوانین بازگشت کالا به‌صورت قابل‌فهم و در دسترس.",
      symbol: "بازگشت",
    },
  ],
};

export async function getHomeContent(): Promise<HomeContent> {
  return mockHomeContent;
}
