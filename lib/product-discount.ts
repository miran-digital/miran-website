import { priceInputToRial, type IranPriceUnit } from "./money.ts";

export type ProductDiscountType = "none" | "percentage" | "amount";

export type ProductDiscountResult = {
  basePriceRial: number;
  discountType: ProductDiscountType;
  discountValue: number;
  discountRial: number;
  finalPriceRial: number;
};

/** Calculate a product discount while keeping the ledger in whole rials. */
export function calculateProductDiscount(input: {
  basePrice: number;
  priceUnit: IranPriceUnit;
  discountType: ProductDiscountType;
  discountValue: number;
  discountUnit?: IranPriceUnit;
}): ProductDiscountResult {
  const basePriceRial = priceInputToRial(
    Number.isFinite(input.basePrice) ? input.basePrice : 0,
    input.priceUnit,
  );
  const requestedValue = Number.isFinite(input.discountValue)
    ? Math.max(0, input.discountValue)
    : 0;

  if (input.discountType === "percentage") {
    const percentage = Math.round(Math.min(100, requestedValue));
    const discountRial = Math.min(
      basePriceRial,
      Math.round((basePriceRial * percentage) / 100),
    );
    return {
      basePriceRial,
      discountType: percentage > 0 ? "percentage" : "none",
      discountValue: percentage,
      discountRial,
      finalPriceRial: basePriceRial - discountRial,
    };
  }

  if (input.discountType === "amount") {
    const discountRial = Math.min(
      basePriceRial,
      priceInputToRial(requestedValue, input.discountUnit ?? input.priceUnit),
    );
    return {
      basePriceRial,
      discountType: discountRial > 0 ? "amount" : "none",
      discountValue: discountRial,
      discountRial,
      finalPriceRial: basePriceRial - discountRial,
    };
  }

  return {
    basePriceRial,
    discountType: "none",
    discountValue: 0,
    discountRial: 0,
    finalPriceRial: basePriceRial,
  };
}
