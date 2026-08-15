import assert from "node:assert/strict";
import test from "node:test";
import { S3PublicAssetStorage } from "../src/public-asset-storage.js";

function service(overrides = {}) {
  return new S3PublicAssetStorage({
    endpoint: "https://storage.example.com",
    bucket: "miran-media",
    region: "eu-west-1",
    accessKeyId: "access",
    secretAccessKey: "secret",
    forcePathStyle: true,
    publicBaseUrl: "https://media.almiran.ir",
    now: () => new Date("2026-08-16T00:00:00.000Z"),
    ...overrides,
  });
}

test("public media upload is signed but resulting URL uses configured media origin", () => {
  const storage = service();
  const key = "public/products/product-1/photo.webp";
  const ticket = storage.issueAssetUpload({
    key,
    mimeType: "image/webp",
    sha256: "a".repeat(64),
  });
  const signed = new URL(ticket.uploadUrl);
  assert.equal(signed.host, "storage.example.com");
  assert.equal(signed.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.ok(signed.searchParams.get("X-Amz-Signature"));
  assert.equal(storage.publicUrl(key), "https://media.almiran.ir/public/products/product-1/photo.webp");
});

test("public media storage rejects private/traversal keys", () => {
  const storage = service();
  assert.throws(() => storage.publicUrl("private/sellers/x/id.pdf"), /invalid public asset key/i);
  assert.throws(() => storage.publicUrl("public/products/../secret"), /invalid public asset key/i);
});
