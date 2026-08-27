import { readStorefrontState } from "@/db/admin-repository";
import { toPublicStorefrontState } from "@/features/admin/public-storefront";
import { getAdminCatalogCategories } from "@/features/catalog/catalog-data";

export const dynamic = "force-dynamic";

const publicStateHeaders = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  "cdn-cache-control": "no-store",
  "cloudflare-cdn-cache-control": "no-store",
  pragma: "no-cache",
};

export async function GET() {
  try {
    const state = await readStorefrontState();
    return Response.json(
      {
        state: toPublicStorefrontState(state, {
          categoryTaxonomy: getAdminCatalogCategories(),
        }),
      },
      {
        headers: publicStateHeaders,
      },
    );
  } catch {
    console.error("storefront_api_data_unavailable");
    return Response.json(
      { error: "اطلاعات فروشگاه موقتاً در دسترس نیست." },
      {
        status: 503,
        headers: { ...publicStateHeaders, "retry-after": "30" },
      },
    );
  }
}
