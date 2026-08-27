import type { AdminState } from "../features/admin/admin-types.ts";
import { getRuntimeEnv } from "./runtime-env.ts";

export type ManagedUploadReceipt = {
  url: string;
  cleanupToken: string;
};

const managedMediaKeyPattern = /^(?:branding|banners|categories|products|product-videos)\/[a-f0-9-]+\.(?:avif|heic|heif|jpg|jpeg|png|webp|mp4|webm)$/i;

export function collectManagedMediaUrls(state: AdminState) {
  return new Set([
    state.branding.logoUrl,
    ...state.banners.flatMap((banner) => [banner.desktopImageUrl, banner.mobileImageUrl]),
    ...state.customCategories.map((category) => category.imageUrl),
    ...state.products.flatMap((product) => [...product.imageUrls, product.videoUrl]),
  ].filter(Boolean));
}

export async function deleteUnreferencedManagedMedia(
  previousUrls: Iterable<string>,
  nextUrls: Iterable<string>,
) {
  const retained = new Set(nextUrls);
  const keys = [...new Set([...previousUrls]
    .filter((url) => !retained.has(url))
    .map(storageKeyFromMediaUrl)
    .filter((key): key is string => Boolean(key)))];
  if (keys.length === 0) return;
  const { BUCKET: bucket } = await getRuntimeEnv<{ BUCKET?: R2Bucket }>().catch(() => ({ BUCKET: undefined }));
  if (!bucket) return;
  await Promise.allSettled(keys.map((key) => bucket.delete(key)));
}

export async function deleteRollbackUploads(
  uploads: readonly ManagedUploadReceipt[],
  uploadedBy: string,
  bucketOverride?: R2Bucket,
) {
  const bucket = bucketOverride ?? await getRuntimeEnv<{ BUCKET?: R2Bucket }>()
    .then((runtime) => runtime.BUCKET)
    .catch(() => undefined);
  if (!bucket) return 0;

  const normalizedEmail = uploadedBy.trim().toLowerCase();
  const uniqueUploads = new Map<string, ManagedUploadReceipt>();
  for (const upload of uploads.slice(0, 10)) {
    const key = storageKeyFromMediaUrl(upload.url);
    if (key && /^[a-f0-9-]{20,80}$/i.test(upload.cleanupToken)) {
      uniqueUploads.set(key, upload);
    }
  }

  let deleted = 0;
  await Promise.all([...uniqueUploads].map(async ([key, upload]) => {
    const object = await bucket.get(key).catch(() => null);
    const metadata = (object as (R2ObjectBody & {
      customMetadata?: Record<string, string>;
    }) | null)?.customMetadata;
    if (
      metadata?.uploadedBy?.trim().toLowerCase() !== normalizedEmail ||
      metadata?.cleanupToken !== upload.cleanupToken
    ) {
      return;
    }
    await bucket.delete(key);
    deleted += 1;
  }));
  return deleted;
}

export function storageKeyFromMediaUrl(value: string) {
  if (!value.startsWith("/media/")) return "";
  const key = value.slice("/media/".length);
  return managedMediaKeyPattern.test(key) ? key : "";
}
