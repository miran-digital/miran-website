import { apiRequest } from "@/lib/api/client";

export type StorefrontHeaderMessage = {
  id: string;
  text: string;
  href: string | null;
  backgroundColor: string;
  textColor: string;
  startsAt: string | null;
  endsAt: string | null;
  visible: boolean;
  sortOrder: number;
};

export type StorefrontBanner = {
  id: string;
  title: string;
  href: string | null;
  imageUrl: string | null;
  placement: "TOP" | "HERO" | "SMALL";
  visible: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
};

export type StorefrontSection = {
  key: string;
  visible: boolean;
  sortOrder: number;
};

export type StorefrontCms = {
  headerMessages: StorefrontHeaderMessage[];
  banners: StorefrontBanner[];
  sections: StorefrontSection[];
};

export async function getStorefrontCms(): Promise<StorefrontCms> {
  return apiRequest<StorefrontCms>("/v1/storefront");
}

export function sectionVisible(cms: StorefrontCms, key: string) {
  return cms.sections.find((section) => section.key === key)?.visible !== false;
}
