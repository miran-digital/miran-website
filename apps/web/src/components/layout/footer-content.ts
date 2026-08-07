export type FooterLink = { label: string; href: string };
export type FooterGroup = {
  id: string;
  title: string;
  links: readonly FooterLink[];
};
export type FooterContent = {
  description: string;
  groups: readonly FooterGroup[];
  legalLinks: readonly FooterLink[];
};

const mockFooterContent: FooterContent = {
  description:
    'Miran Shop؛ فروشگاهی مدرن برای پیدا کردن، مقایسه و خرید ساده‌تر کالاهای مورد نیاز شما.',
  groups: [
    {
      id: 'shop',
      title: 'خرید',
      links: [
        { label: 'دسته‌بندی‌ها', href: '/categories' },
        { label: 'پیشنهادهای ویژه', href: '/offers' },
        { label: 'برندها', href: '/brands' },
        { label: 'محبوب‌ها', href: '/trending' }
      ]
    },
    {
      id: 'help',
      title: 'راهنما و پشتیبانی',
      links: [
        { label: 'راهنمای خرید', href: '/help/buying' },
        { label: 'ارسال سفارش', href: '/help/delivery' },
        { label: 'بازگشت کالا', href: '/help/returns' },
        { label: 'تماس با ما', href: '/contact' }
      ]
    },
    {
      id: 'about',
      title: 'Miran Shop',
      links: [
        { label: 'درباره ما', href: '/about' },
        { label: 'همکاری با ما', href: '/careers' },
        { label: 'فروش در Miran', href: '/sell' },
        { label: 'مجله Miran', href: '/magazine' }
      ]
    }
  ],
  legalLinks: [
    { label: 'حریم خصوصی', href: '/privacy' },
    { label: 'شرایط استفاده', href: '/terms' },
    { label: 'کوکی‌ها', href: '/cookies' }
  ]
};
export async function getFooterContent(): Promise<FooterContent> {
  return mockFooterContent;
}
