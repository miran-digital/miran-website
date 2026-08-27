import { getRuntimeEnv } from "@/lib/runtime-env";
import { servePublicMediaObject } from "@/lib/public-media";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return serveMedia(request, context, false);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return serveMedia(request, context, true);
}

async function serveMedia(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
  headOnly: boolean,
) {
  const { path } = await context.params;
  const key = path.join("/");
  const { BUCKET: bucket } = await getRuntimeEnv<{ BUCKET?: R2Bucket }>();
  return servePublicMediaObject(request, key, bucket, headOnly);
}
