import { getBankTransferReceiptFile } from "@/db/bank-transfer-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getAdminAccess("orders.write");
  if (!access.allowed) {
    return Response.json(
      { error: "دسترسی مدیریت مجاز نیست." },
      { status: access.reason === "anonymous" ? 401 : 403 },
    );
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const receipt = await getBankTransferReceiptFile(id);
  if (!receipt) return new Response("Not found", { status: 404 });
  const { BUCKET: bucket } = await getRuntimeEnv<{ BUCKET?: R2Bucket }>();
  if (!bucket) return new Response("Unavailable", { status: 503 });
  const object = await bucket.get(receipt.storage_key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(receipt.original_name)}`,
    "content-type": receipt.content_type,
    "x-content-type-options": "nosniff",
  });
  return new Response(object.body, { headers });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
