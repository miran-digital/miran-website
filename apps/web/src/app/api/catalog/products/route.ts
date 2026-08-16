import { NextResponse } from "next/server";
import { ApiError, apiRequest } from "@/lib/api/client";

function respondError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "CATALOG_REQUEST_FAILED", message: "دریافت محصولات انجام نشد." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const input = new URL(request.url);
    const params = new URLSearchParams();
    for (const key of ["limit", "offset", "category", "amazing", "q"] as const) {
      const value = input.searchParams.get(key);
      if (value) params.set(key, value.slice(0, 200));
    }
    const suffix = params.size ? `?${params.toString()}` : "";
    const products = await apiRequest(`/v1/catalog/products${suffix}`);
    return NextResponse.json({ products });
  } catch (error) {
    return respondError(error);
  }
}
