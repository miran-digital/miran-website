import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const product = await apiRequest(`/v1/catalog/products/${encodeURIComponent(id)}`);
    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "CATALOG_PRODUCT_FAILED", message: "دریافت محصول انجام نشد." },
      { status: 500 },
    );
  }
}
