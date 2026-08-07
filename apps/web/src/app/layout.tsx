import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@miran/ui';
import './storefront.css';
import { MobileNavigation } from '@/components/layout/mobile-navigation';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = {
  title: { default: 'Miran Shop', template: '%s | Miran Shop' },
  description: 'Miran Shop marketplace storefront',
  robots: {
    index: process.env.NODE_ENV === 'production',
    follow: process.env.NODE_ENV === 'production'
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
        <MobileNavigation />
      </body>
    </html>
  );
}
