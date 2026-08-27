export type NavigationLink = {
  label: string;
  href: string;
};

export type NavigationGroup = {
  label: string;
  href: string;
  links: readonly NavigationLink[];
};

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: 'کالای دیجیتال',
    href: '/category/digital',
    links: [
      { label: 'موبایل', href: '/category/mobile' },
      { label: 'لپ‌تاپ و کامپیوتر', href: '/category/computers' },
      { label: 'هدفون و صوتی', href: '/category/audio' },
      { label: 'لوازم جانبی', href: '/category/accessories' }
    ]
  },
  {
    label: 'خانه و آشپزخانه',
    href: '/category/home-kitchen',
    links: [
      { label: 'لوازم برقی', href: '/category/home-appliances' },
      { label: 'پخت‌وپز', href: '/category/cooking' },
      { label: 'نظافت و شست‌وشو', href: '/category/cleaning' },
      { label: 'دکوراسیون', href: '/category/home-decor' }
    ]
  },
  {
    label: 'مد و پوشاک',
    href: '/category/fashion',
    links: [
      { label: 'پوشاک زنانه', href: '/category/women' },
      { label: 'پوشاک مردانه', href: '/category/men' },
      { label: 'کفش', href: '/category/shoes' },
      { label: 'کیف و اکسسوری', href: '/category/fashion-accessories' }
    ]
  },
  {
    label: 'زیبایی و سلامت',
    href: '/category/beauty-health',
    links: [
      { label: 'مراقبت پوست', href: '/category/skincare' },
      { label: 'مراقبت مو', href: '/category/haircare' },
      { label: 'عطر و ادکلن', href: '/category/fragrance' },
      { label: 'بهداشت شخصی', href: '/category/personal-care' }
    ]
  },
  {
    label: 'ورزش و سفر',
    href: '/category/sports-travel',
    links: []
  },
  {
    label: 'کودک و سرگرمی',
    href: '/category/kids-entertainment',
    links: []
  },
  {
    label: 'خودرو و ابزار',
    href: '/category/automotive-tools',
    links: []
  },
  {
    label: 'سوپرمارکت',
    href: '/category/grocery',
    links: []
  },
  {
    label: 'دخانیات',
    href: '/category/tobacco',
    links: []
  }
] as const;
