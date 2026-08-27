export async function servePublicMediaObject(
  request: Request,
  key: string,
  bucket: R2Bucket | undefined,
  headOnly = false,
) {
  if (!isPublicMediaKey(key)) return unavailable("Not found", 404);
  if (!bucket) return unavailable("Unavailable", 503);
  const object = await bucket.get(key);
  if (!object) return unavailable("Not found", 404);

  if (request.headers.get("if-none-match") === object.httpEtag) {
    return new Response(null, {
      status: 304,
      headers: publicMediaHeaders(object.httpEtag),
    });
  }

  const headers = publicMediaHeaders(object.httpEtag);
  object.writeHttpMetadata(headers);
  headers.set("content-disposition", "inline");
  return new Response(headOnly ? null : object.body, { headers });
}

export function isPublicMediaKey(key: string) {
  return /^(?:(?:products|branding|banners|categories)\/[a-f0-9-]+\.(?:avif|heic|heif|jpg|png|webp)|product-videos\/[a-f0-9-]+\.(?:mp4|webm))$/.test(
    key,
  );
}

function publicMediaHeaders(etag: string) {
  return new Headers({
    "cache-control": "public, max-age=31536000, immutable",
    etag,
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
  });
}

function unavailable(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
