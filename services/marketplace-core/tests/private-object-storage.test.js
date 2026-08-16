import assert from "node:assert/strict";
import test from "node:test";
import { S3PrivateObjectStorage } from "../src/private-object-storage.js";

function storage(overrides = {}) {
  return new S3PrivateObjectStorage({
    endpoint: "https://storage.example.com",
    bucket: "miran-private",
    region: "eu-west-1",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    forcePathStyle: true,
    now: () => new Date("2026-08-16T00:00:00.000Z"),
    ...overrides,
  });
}

test("private upload and download URLs are short-lived SigV4 URLs", () => {
  const service = storage();
  const digest = "a".repeat(64);
  const upload = service.issueUpload({
    key: "private/sellers/seller-1/identity.pdf",
    mimeType: "application/pdf",
    sha256: digest,
  });

  const url = new URL(upload.uploadUrl);
  assert.equal(url.protocol, "https:");
  assert.equal(url.host, "storage.example.com");
  assert.equal(url.pathname, "/miran-private/private/sellers/seller-1/identity.pdf");
  assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
  assert.ok(url.searchParams.get("X-Amz-Signature"));
  assert.match(url.searchParams.get("X-Amz-SignedHeaders") || "", /content-type/);
  assert.match(url.searchParams.get("X-Amz-SignedHeaders") || "", /x-amz-meta-sha256/);
  assert.equal(upload.headers["content-type"], "application/pdf");
  assert.equal(upload.headers["x-amz-meta-sha256"], digest);

  const download = service.issueDownload({ key: "private/sellers/seller-1/identity.pdf" });
  assert.equal(new URL(download.downloadUrl).searchParams.get("X-Amz-Expires"), "300");
});

test("private object keys reject traversal and public namespaces", () => {
  const service = storage();
  assert.throws(
    () => service.issueDownload({ key: "public/sellers/seller-1/id.pdf" }),
    /invalid private object key/i,
  );
  assert.throws(
    () => service.issueDownload({ key: "private/sellers/../id.pdf" }),
    /invalid private object key/i,
  );
});

test("HEAD verification checks length, content type and sha256 metadata", async () => {
  const digest = "b".repeat(64);
  const service = storage({
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "HEAD");
      return new Response(null, {
        status: 200,
        headers: {
          "content-length": "2048",
          "content-type": "application/pdf",
          "x-amz-meta-sha256": digest,
        },
      });
    },
  });

  assert.equal(
    await service.verifyObject({
      key: "private/sellers/seller-1/identity.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      sha256: digest,
    }),
    true,
  );

  const mismatch = storage({
    fetchImpl: async () => new Response(null, {
      status: 200,
      headers: {
        "content-length": "10",
        "content-type": "application/pdf",
        "x-amz-meta-sha256": digest,
      },
    }),
  });
  await assert.rejects(
    () => mismatch.verifyObject({
      key: "private/sellers/seller-1/identity.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      sha256: digest,
    }),
    /size does not match/i,
  );
});
