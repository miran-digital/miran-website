import { getSellerDocumentRecord } from "@/db/admin-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getAdminAccess("sellers.write");
  if (!access.allowed) {
    return Response.json(
      { error: "دسترسی مدیریت مجاز نیست." },
      { status: access.reason === "anonymous" ? 401 : 403 },
    );
  }
  const url = new URL(request.url);
  const applicationId = (url.searchParams.get("applicationId") ?? "").slice(
    0,
    120,
  );
  const documentId = (url.searchParams.get("documentId") ?? "").slice(0, 120);
  if (!applicationId || !documentId) {
    return new Response("Not found", { status: 404 });
  }
  const document = await getSellerDocumentRecord(applicationId, documentId);
  if (!document) return new Response("Not found", { status: 404 });
  const { BUCKET: bucket } = await getRuntimeEnv<{ BUCKET?: R2Bucket }>();
  if (!bucket) return new Response("Unavailable", { status: 503 });
  const object = await bucket.get(document.storageKey);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
    "x-content-type-options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
