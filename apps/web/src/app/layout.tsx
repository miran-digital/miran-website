import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@miran/ui';

export const metadata: Metadata = {
  title: { default: 'Miran Shop', template: '%s | Miran Shop' },
  description: 'Miran Shop marketplace storefront',
  robots: {
    index: process.env.NODE_ENV === 'production',
    follow: process.env.NODE_ENV === 'production'
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
