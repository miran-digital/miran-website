import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/components/ui";
import "./globals.css";
import "./storefront.css";
import "./color-theme.css";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getSiteUrl } from "@/lib/site-url";
import { readStorefrontState } from "@/db/admin-repository";
import { createDefaultAdminState } from "@/features/admin/admin-types";
import { PublicStorefrontProvider } from "@/features/admin/public-storefront-provider";
import {
  createUnavailablePublicStorefrontState,
  toPublicStorefrontState,
} from "@/features/admin/public-storefront";
import { getAdminCatalogCategories } from "@/features/catalog/catalog-data";
import { estedad, vazirmatn } from "@/lib/fonts";
import { isMockStorefrontAllowed } from "@/lib/storefront-runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "فروشگاه اینترنتی میران | Miran Shop",
    template: "%s | فروشگاه اینترنتی میران",
  },
  description:
    "فروشگاه اینترنتی Miran Shop؛ تجربه‌ای ساده و مطمئن برای جست‌وجو، مقایسه و خرید آنلاین.",
  applicationName: "Miran Shop",
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    url: "/",
    siteName: "Miran Shop",
    title: "فروشگاه اینترنتی میران",
    description:
      "جست‌وجو، مقایسه و خرید آنلاین محصولات در فروشگاه اینترنتی میران.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "MIRAN؛ فروشگاه اینترنتی میران",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "فروشگاه اینترنتی میران",
    description:
      "جست‌وجو، مقایسه و خرید آنلاین محصولات در فروشگاه اینترنتی میران.",
    images: ["/og.png"],
  },
  robots: {
    index: process.env.SITE_INDEXABLE === "true",
    follow: process.env.SITE_INDEXABLE === "true",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const publicState = await readStorefrontState()
    .then((state) => toPublicStorefrontState(state, {
      categoryTaxonomy: getAdminCatalogCategories(),
    }))
    .catch(() => {
      console.error("storefront_shell_data_unavailable");
      if (isMockStorefrontAllowed()) {
        return toPublicStorefrontState(createDefaultAdminState(), {
          categoryTaxonomy: getAdminCatalogCategories(),
        });
      }
      return createUnavailablePublicStorefrontState();
    });

  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${vazirmatn.variable} ${estedad.variable}`}
    >
      <body>
        <PublicStorefrontProvider initialState={publicState}>
          <SiteHeader />
          {children}
          <SiteFooter />
          <MobileNavigation />
        </PublicStorefrontProvider>
      </body>
    </html>
  );
}
