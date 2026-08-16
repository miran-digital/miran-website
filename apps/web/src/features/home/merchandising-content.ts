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

export async function getHomeMerchandisingContent(): Promise<HomeMerchandisingContent> {
  return {
    specialOffers: {
      id: "special-offers",
      title: "پیشنهادهای ویژه",
      description: "پیشنهادهای ویژه فقط از Catalog واقعی فروشگاه نمایش داده می‌شوند.",
      href: "/offers",
      linkLabel: "مشاهده همه پیشنهادها",
      products: [],
    },
    productSections: [],
    trending: {
      id: "trending",
      title: "محبوب و پربازدید",
      description: "این بخش فقط پس از اتصال داده واقعی رفتار مشتری نمایش داده می‌شود.",
      href: "/trending",
      linkLabel: "مشاهده ترندها",
      products: [],
    },
  };
}
