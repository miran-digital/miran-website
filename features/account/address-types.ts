export type CustomerAddress = {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  addressLine: string;
  city: string;
  province: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerAddressInput = Omit<
  CustomerAddress,
  "id" | "createdAt" | "updatedAt"
>;
