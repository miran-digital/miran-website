export type StorefrontMoney = {
  amountMinor: number;
  currency: string;
};

export type HomeProduct = {
  id: string;
  title: string;
  href: string;
  mediaLabel: string;
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

const gbp = (amountMinor: number): StorefrontMoney => ({ amountMinor, currency: 'GBP' });

const mockMerchandisingContent: HomeMerchandisingContent = {
  specialOffers: {
    id: 'special-offers',
    title: 'پیشنهادهای ویژه',
    description: 'انتخاب‌های محدود با قیمت بهتر؛ داده واقعی بعداً از Pricing و Promotion تأمین می‌شود.',
    href: '/offers',
    linkLabel: 'مشاهده همه پیشنهادها',
    products: [
      { id: 'offer-1', title: 'هدفون بی‌سیم منتخب', href: '/product/wireless-headphones', mediaLabel: 'Audio', eyebrow: 'کالای دیجیتال', badge: 'پیشنهاد ویژه', price: gbp(6999), previousPrice: gbp(8999) },
      { id: 'offer-2', title: 'جارو شارژی سبک', href: '/product/cordless-vacuum', mediaLabel: 'Home', eyebrow: 'خانه و آشپزخانه', badge: 'تخفیف', price: gbp(11999), previousPrice: gbp(14999) },
      { id: 'offer-3', title: 'کفش روزمره راحت', href: '/product/everyday-shoes', mediaLabel: 'Fashion', eyebrow: 'مد و پوشاک', badge: 'قیمت ویژه', price: gbp(5499), previousPrice: gbp(6999) },
      { id: 'offer-4', title: 'ست مراقبت پوست', href: '/product/skincare-set', mediaLabel: 'Beauty', eyebrow: 'زیبایی و سلامت', badge: 'منتخب', price: gbp(3299), previousPrice: gbp(4299) }
    ]
  },
  productSections: [
    {
      id: 'digital-picks',
      title: 'منتخب کالای دیجیتال',
      description: 'محصولات پیشنهادی برای شروع تجربه خرید Miran Shop.',
      href: '/category/digital',
      linkLabel: 'مشاهده کالای دیجیتال',
      products: [
        { id: 'digital-1', title: 'گوشی هوشمند روزمره', href: '/product/smartphone-daily', mediaLabel: 'Mobile', eyebrow: 'موبایل', price: gbp(24999) },
        { id: 'digital-2', title: 'لپ‌تاپ سبک کاری', href: '/product/light-laptop', mediaLabel: 'Laptop', eyebrow: 'کامپیوتر', price: gbp(64999) },
        { id: 'digital-3', title: 'اسپیکر قابل حمل', href: '/product/portable-speaker', mediaLabel: 'Audio', eyebrow: 'صوتی', price: gbp(7999) },
        { id: 'digital-4', title: 'شارژر سریع چندپورت', href: '/product/multiport-charger', mediaLabel: 'Power', eyebrow: 'لوازم جانبی', price: gbp(3999) }
      ]
    },
    {
      id: 'home-picks',
      title: 'برای خانه',
      description: 'انتخاب‌های کاربردی خانه و آشپزخانه با ساختار آماده اتصال به Catalog.',
      href: '/category/home-kitchen',
      linkLabel: 'مشاهده خانه و آشپزخانه',
      products: [
        { id: 'home-1', title: 'کتری برقی جمع‌وجور', href: '/product/electric-kettle', mediaLabel: 'Kitchen', eyebrow: 'آشپزخانه', price: gbp(2999) },
        { id: 'home-2', title: 'قهوه‌ساز خانگی', href: '/product/home-coffee-maker', mediaLabel: 'Coffee', eyebrow: 'لوازم برقی', price: gbp(8999) },
        { id: 'home-3', title: 'سرویس ظروف مینیمال', href: '/product/minimal-tableware', mediaLabel: 'Dining', eyebrow: 'پذیرایی', price: gbp(4599) },
        { id: 'home-4', title: 'چراغ رومیزی مدرن', href: '/product/modern-desk-lamp', mediaLabel: 'Decor', eyebrow: 'دکوراسیون', price: gbp(3499) }
      ]
    }
  ],
  trending: {
    id: 'trending',
    title: 'محبوب و پربازدید',
    description: 'جایگاه آماده برای داده‌های آینده Analytics و Recommendation.',
    href: '/trending',
    linkLabel: 'مشاهده ترندها',
    products: [
      { id: 'trend-1', title: 'ساعت هوشمند سبک', href: '/product/light-smartwatch', mediaLabel: 'Watch', eyebrow: 'پرفروش', badge: 'ترند', price: gbp(12999) },
      { id: 'trend-2', title: 'کیف روزمره مینیمال', href: '/product/minimal-bag', mediaLabel: 'Bag', eyebrow: 'محبوب', badge: 'ترند', price: gbp(4999) },
      { id: 'trend-3', title: 'مخلوط‌کن شخصی', href: '/product/personal-blender', mediaLabel: 'Kitchen', eyebrow: 'پربازدید', badge: 'ترند', price: gbp(3999) },
      { id: 'trend-4', title: 'کیت ابزار خانگی', href: '/product/home-tool-kit', mediaLabel: 'Tools', eyebrow: 'محبوب', badge: 'ترند', price: gbp(5999) }
    ]
  }
};

export async function getHomeMerchandisingContent(): Promise<HomeMerchandisingContent> {
  return mockMerchandisingContent;
}
