import type { CustomerAddressInput } from "./address-types";

export function validateCustomerAddressPayload(
  value: unknown,
): CustomerAddressInput | null {
  const recipientName = objectText(value, "recipientName", 120);
  const phone = objectText(value, "phone", 40);
  const addressLine = objectText(value, "addressLine", 500);
  const city = objectText(value, "city", 100);
  const province = objectText(value, "province", 100);
  const postcode = objectText(value, "postcode", 20);
  const label = objectText(value, "label", 60) || "نشانی من";
  const latitude = objectCoordinate(value, "latitude", -90, 90);
  const longitude = objectCoordinate(value, "longitude", -180, 180);

  if (
    !recipientName ||
    !/^[+\d۰-۹٠-٩ ()-]{7,40}$/.test(phone) ||
    addressLine.length < 8 ||
    !city ||
    !province ||
    (latitude !== null && !Number.isFinite(latitude)) ||
    (longitude !== null && !Number.isFinite(longitude)) ||
    ((latitude === null) !== (longitude === null))
  ) return null;

  return {
    label,
    recipientName,
    phone,
    addressLine,
    city,
    province,
    postcode,
    latitude,
    longitude,
    isDefault:
      typeof value === "object" &&
      value !== null &&
      (value as Record<string, unknown>).isDefault === true,
  };
}

function objectText(value: unknown, key: string, maxLength: number) {
  if (typeof value !== "object" || value === null) return "";
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" ? item.trim().slice(0, maxLength) : "";
}

function objectCoordinate(
  value: unknown,
  key: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "object" || value === null) return null;
  const item = (value as Record<string, unknown>)[key];
  if (item === null || item === undefined || item === "") return null;
  return typeof item === "number" &&
    Number.isFinite(item) &&
    item >= minimum &&
    item <= maximum
    ? item
    : Number.NaN;
}
