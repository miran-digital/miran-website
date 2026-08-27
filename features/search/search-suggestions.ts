import { normalizePersianSearchText } from "@/lib/persian-search";

export type SearchSuggestion = {
  id: string;
  label: string;
  href: string;
  category?: string;
};

const mockSuggestions: readonly SearchSuggestion[] = [
  { id: 'phone', label: 'گوشی موبایل', href: '/search?q=گوشی+موبایل', category: 'کالای دیجیتال' },
  { id: 'laptop', label: 'لپ‌تاپ', href: '/search?q=لپ‌تاپ', category: 'کالای دیجیتال' },
  { id: 'headphone', label: 'هدفون بی‌سیم', href: '/search?q=هدفون+بی‌سیم', category: 'کالای دیجیتال' },
  { id: 'vacuum', label: 'جاروبرقی', href: '/search?q=جاروبرقی', category: 'خانه و آشپزخانه' },
  { id: 'shoe', label: 'کفش', href: '/search?q=کفش', category: 'مد و پوشاک' },
  { id: 'perfume', label: 'عطر', href: '/search?q=عطر', category: 'زیبایی و سلامت' }
] as const;

export function getMockSearchSuggestions(query: string, limit = 6): SearchSuggestion[] {
  const normalized = normalizePersianSearchText(query);
  if (normalized.length < 2) return [];

  return mockSuggestions
    .filter((item) => normalizePersianSearchText(`${item.label} ${item.category ?? ''}`).includes(normalized))
    .slice(0, limit);
}
