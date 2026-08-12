export type SellerApplication = {
  id: string;
  createdAt: string;
  storeName: string;
  contactName: string;
  email: string;
  phone: string;
  category: string;
  notes: string;
  status: "new" | "reviewing" | "approved" | "rejected";
};

const storageKey = "miran.seller-applications.v1";
const sellerChangeEvent = "miran:seller-applications-change";

function isApplication(value: unknown): value is SellerApplication {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.storeName === "string" &&
    typeof item.contactName === "string" &&
    typeof item.email === "string" &&
    typeof item.phone === "string" &&
    typeof item.category === "string" &&
    typeof item.notes === "string" &&
    ["new", "reviewing", "approved", "rejected"].includes(String(item.status))
  );
}

export function getSellerApplications() {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isApplication).slice(0, 250);
  } catch {
    return [];
  }
}

function saveSellerApplications(applications: SellerApplication[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(applications));
  } catch {
    // The form reports success only after the in-memory record is created.
  }
  window.dispatchEvent(new CustomEvent(sellerChangeEvent));
  return applications;
}

export function subscribeToSellerApplications(listener: () => void) {
  window.addEventListener(sellerChangeEvent, listener);
  return () => window.removeEventListener(sellerChangeEvent, listener);
}

export function createSellerApplication(
  input: Omit<SellerApplication, "id" | "createdAt" | "status">,
) {
  const application: SellerApplication = {
    id:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `seller-${Date.now()}`,
    createdAt: new Date().toISOString(),
    storeName: input.storeName.trim().slice(0, 120),
    contactName: input.contactName.trim().slice(0, 120),
    email: input.email.trim().slice(0, 200),
    phone: input.phone.trim().slice(0, 40),
    category: input.category.trim().slice(0, 100),
    notes: input.notes.trim().slice(0, 1000),
    status: "new",
  };
  saveSellerApplications([application, ...getSellerApplications()]);
  return application;
}

export function updateSellerApplicationStatus(
  id: string,
  status: SellerApplication["status"],
) {
  const applications = getSellerApplications().map((application) =>
    application.id === id ? { ...application, status } : application,
  );
  return saveSellerApplications(applications);
}
