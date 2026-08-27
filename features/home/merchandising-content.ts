export type StorefrontMoney = {
  amountMinor: number;
  currency: string;
};

export type HomeProduct = {
  id: string;
  title: string;
  href: string;
  mediaLabel: string;
  imageUrl?: string;
  eyebrow?: string;
  badge?: string;
  offerEndsAt?: string;
  price: StorefrontMoney;
  previousPrice?: StorefrontMoney;
};

export type HomeProductRail = {
  id: string;
  title: string;
  description?: string;
  href: string;
  linkLabel: string;
  products: readonly HomeProduct[];
};

export type HomeMerchandisingContent = {
  specialOffers: HomeProductRail;
  productSections: readonly HomeProductRail[];
  trending: HomeProductRail;
};

const irr = (legacyAmountMinor: number): StorefrontMoney => ({
  amountMinor: legacyAmountMinor * 10_000,
  currency: "IRR",
});

const mockMerchandisingContent: HomeMerchandisingContent = {
  specialOffers: {
    id: "special-offers",
    title: "پیشنهاد شگفت‌انگیز",
    description:
      "انتخاب‌های محدود و جذاب با قیمت بهتر برای خرید امروز.",
    href: "/offers",
    linkLabel: "مشاهده همه پیشنهادها",
    products: [
      {
        id: "audio-1",
        title: "هدفون بی‌سیم Sonic One",
        href: "/product/sonic-one",
        mediaLabel: "Audio",
        eyebrow: "کالای دیجیتال",
        badge: "پیشنهاد ویژه",
        price: irr(6999),
        previousPrice: irr(8999),
      },
      {
        id: "home-2",
        title: "جارو شارژی Haven Lite",
        href: "/product/haven-vacuum",
        mediaLabel: "Home",
        eyebrow: "خانه و آشپزخانه",
        badge: "تخفیف",
        price: irr(11999),
        previousPrice: irr(14999),
      },
      {
        id: "fashion-1",
        title: "کفش روزمره Move",
        href: "/product/move-everyday",
        mediaLabel: "Fashion",
        eyebrow: "مد و پوشاک",
        badge: "قیمت ویژه",
        price: irr(5499),
        previousPrice: irr(6999),
      },
      {
        id: "beauty-1",
        title: "ست مراقبت پوست Pure",
        href: "/product/pure-skincare-set",
        mediaLabel: "Beauty",
        eyebrow: "زیبایی و سلامت",
        badge: "منتخب",
        price: irr(3299),
        previousPrice: irr(4299),
      },
    ],
  },
  productSections: [
    {
      id: "digital-picks",
      title: "منتخب کالای دیجیتال",
      description: "محصولات پیشنهادی برای شروع تجربه خرید Miran Shop.",
      href: "/category/digital",
      linkLabel: "مشاهده کالای دیجیتال",
      products: [
        {
          id: "phone-1",
          title: "گوشی هوشمند Nova 128GB",
          href: "/product/nova-128",
          mediaLabel: "Mobile",
          eyebrow: "موبایل",
          price: irr(24999),
        },
        {
          id: "laptop-1",
          title: "لپ‌تاپ سبک Vertex 14",
          href: "/product/vertex-14",
          mediaLabel: "Laptop",
          eyebrow: "کامپیوتر",
          price: irr(64999),
        },
        {
          id: "audio-2",
          title: "اسپیکر قابل حمل Sonic Mini",
          href: "/product/sonic-mini",
          mediaLabel: "Audio",
          eyebrow: "صوتی",
          price: irr(7999),
        },
        {
          id: "power-1",
          title: "شارژر سریع Volt 65W",
          href: "/product/volt-65w",
          mediaLabel: "Power",
          eyebrow: "لوازم جانبی",
          price: irr(3999),
        },
      ],
    },
    {
      id: "home-picks",
      title: "برای خانه",
      description:
        "انتخاب‌های کاربردی و دوست‌داشتنی برای خانه و آشپزخانه.",
      href: "/category/home-kitchen",
      linkLabel: "مشاهده خانه و آشپزخانه",
      products: [
        {
          id: "home-1",
          title: "کتری برقی Haven",
          href: "/product/haven-kettle",
          mediaLabel: "Kitchen",
          eyebrow: "آشپزخانه",
          price: irr(2999),
        },
        {
          id: "home-2",
          title: "جارو شارژی Haven Lite",
          href: "/product/haven-vacuum",
          mediaLabel: "Home",
          eyebrow: "لوازم برقی",
          price: irr(11999),
          previousPrice: irr(14999),
        },
        {
          id: "home-3",
          title: "چراغ رومیزی Loom",
          href: "/product/loom-desk-lamp",
          mediaLabel: "Decor",
          eyebrow: "دکوراسیون",
          price: irr(3499),
        },
      ],
    },
  ],
  trending: {
    id: "trending",
    title: "محبوب و پربازدید",
    description: "محصولاتی که این روزها بیشتر دیده و انتخاب می‌شوند.",
    href: "/trending",
    linkLabel: "مشاهده ترندها",
    products: [
      {
        id: "phone-2",
        title: "گوشی هوشمند Orbit Pro",
        href: "/product/orbit-pro",
        mediaLabel: "Mobile",
        eyebrow: "پرفروش",
        badge: "ترند",
        price: irr(39999),
        previousPrice: irr(42999),
      },
      {
        id: "fashion-2",
        title: "کیف مینیمال Loom",
        href: "/product/loom-minimal-bag",
        mediaLabel: "Bag",
        eyebrow: "محبوب",
        badge: "ترند",
        price: irr(4999),
      },
      {
        id: "beauty-2",
        title: "ماسک موی Pure Care",
        href: "/product/pure-hair-mask",
        mediaLabel: "Beauty",
        eyebrow: "پربازدید",
        badge: "ترند",
        price: irr(1899),
      },
      {
        id: "auto-1",
        title: "کیت ابزار Drive 40",
        href: "/product/drive-tool-kit",
        mediaLabel: "Tools",
        eyebrow: "محبوب",
        badge: "ترند",
        price: irr(5999),
      },
    ],
  },
};

export async function getHomeMerchandisingContent(): Promise<HomeMerchandisingContent> {
  if (isMockStorefrontAllowed()) return mockMerchandisingContent;
  return {
    specialOffers: { ...mockMerchandisingContent.specialOffers, products: [] },
    productSections: mockMerchandisingContent.productSections.map((section) => ({
      ...section,
      products: [],
    })),
    trending: { ...mockMerchandisingContent.trending, products: [] },
  };
}
import { isMockStorefrontAllowed } from "@/lib/storefront-runtime";
