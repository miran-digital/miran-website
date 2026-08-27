import type { AdminState } from "./admin-types";

export type AdminRevision = {
  id: string;
  actorEmail: string;
  createdAt: string;
};

export async function getAdminRevisions() {
  const response = await fetch("/api/admin/revisions", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    revisions?: AdminRevision[];
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error || "دریافت تاریخچه ممکن نشد.");
  return payload.revisions ?? [];
}

export async function restoreAdminRevision(id: string) {
  const response = await fetch("/api/admin/revisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const payload = (await response.json()) as { state?: AdminState; error?: string };
  if (!response.ok || !payload.state) {
    throw new Error(payload.error || "بازگردانی نسخه ممکن نشد.");
  }
  return payload.state;
}
