export const MEDIA_BACKUP_FORMAT = "miran-shop-r2-backup-v1" as const;
export const MEDIA_BACKUP_MANIFEST_PATH = "_miran/manifest.json" as const;

const TAR_BLOCK_SIZE = 512;
const TAR_END_SIZE = TAR_BLOCK_SIZE * 2;
const MAX_TAR_OCTAL_SIZE = 0o77777777777;
const encoder = new TextEncoder();

export type MediaBackupObject = {
  key: string;
  size: number;
  etag: string;
  uploaded: string;
  httpMetadata: Record<string, string>;
  customMetadata: Record<string, string>;
};

export type MediaBackupManifest = {
  format: typeof MEDIA_BACKUP_FORMAT;
  exportedAt: string;
  objectCount: number;
  totalObjectBytes: number;
  objects: MediaBackupObject[];
  complete: true;
};

export function isOwnerMediaBackupAccess(access: {
  allowed: boolean;
  role?: string;
}) {
  return access.allowed && access.role === "owner";
}

export async function createMediaBackupTar(
  bucket: R2Bucket,
  options: { exportedAt?: string } = {},
) {
  const exportedAt = normalizeExportedAt(options.exportedAt ?? new Date().toISOString());
  const initialInventory = await listMediaBackupInventory(bucket);
  const totalObjectBytes = initialInventory.reduce((total, object) => {
    const next = total + object.size;
    if (!Number.isSafeInteger(next)) throw new Error("MEDIA_BACKUP_TOTAL_SIZE_INVALID");
    return next;
  }, 0);
  const manifest: MediaBackupManifest = {
    format: MEDIA_BACKUP_FORMAT,
    exportedAt,
    objectCount: initialInventory.length,
    totalObjectBytes,
    objects: initialInventory,
    complete: true,
  };
  const transform = new TransformStream<Uint8Array, Uint8Array>();
  const writer = transform.writable.getWriter();

  void writeMediaBackupTar(writer, bucket, initialInventory, manifest)
    .catch((error: unknown) => writer.abort(error).catch(() => undefined));

  return {
    body: transform.readable,
  };
}

export async function listMediaBackupInventory(bucket: R2Bucket) {
  const inventory: MediaBackupObject[] = [];
  const seenKeys = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let truncated = true;

  while (truncated) {
    const page = await bucket.list({
      ...(cursor ? { cursor } : {}),
      include: ["httpMetadata", "customMetadata"],
    });
    for (const object of page.objects) {
      const normalized = normalizeListedObject(object);
      if (seenKeys.has(normalized.key)) {
        throw new Error("MEDIA_BACKUP_DUPLICATE_KEY");
      }
      seenKeys.add(normalized.key);
      inventory.push(normalized);
    }
    truncated = page.truncated;
    if (!truncated) continue;
    const nextCursor = page.cursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error("MEDIA_BACKUP_CURSOR_INVALID");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return inventory.sort((left, right) => left.key.localeCompare(right.key));
}

async function writeMediaBackupTar(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  bucket: R2Bucket,
  initialInventory: readonly MediaBackupObject[],
  manifest: MediaBackupManifest,
) {
  for (const [index, expected] of initialInventory.entries()) {
    const object = await bucket.get(expected.key);
    if (!object) throw new Error("MEDIA_BACKUP_OBJECT_MISSING");
    if (object.size !== expected.size) throw new Error("MEDIA_BACKUP_OBJECT_SIZE_MISMATCH");
    if (object.etag !== expected.etag) throw new Error("MEDIA_BACKUP_OBJECT_ETAG_MISMATCH");
    await writeR2Object(writer, object, expected, index);
  }

  const finalInventory = await listMediaBackupInventory(bucket);
  if (!sameInventory(initialInventory, finalInventory)) {
    throw new Error("MEDIA_BACKUP_INVENTORY_CHANGED");
  }

  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2));
  await writeTarEntry(
    writer,
    MEDIA_BACKUP_MANIFEST_PATH,
    manifestBytes.length,
    Date.parse(manifest.exportedAt),
    streamFromBytes(manifestBytes),
    "_miran/manifest.json",
  );
  await writer.write(new Uint8Array(TAR_END_SIZE));
  await writer.close();
}

async function writeR2Object(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  object: R2ObjectBody,
  expected: MediaBackupObject,
  index: number,
) {
  const fallbackName = `_miran/objects/${String(index + 1).padStart(10, "0")}`;
  await writePaxHeader(writer, expected, fallbackName);
  await writeTarEntry(
    writer,
    fallbackName,
    expected.size,
    Date.parse(expected.uploaded),
    object.body,
    fallbackName,
  );
}

async function writePaxHeader(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  object: MediaBackupObject,
  fallbackName: string,
) {
  const payload = encoder.encode([
    createPaxRecord("path", object.key),
    createPaxRecord("size", String(object.size)),
  ].join(""));
  await writeTarEntry(
    writer,
    `${fallbackName}.pax`,
    payload.length,
    Date.parse(object.uploaded),
    streamFromBytes(payload),
    `${fallbackName}.pax`,
    "x",
  );
}

async function writeTarEntry(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  path: string,
  size: number,
  modifiedAt: number,
  body: ReadableStream<Uint8Array>,
  headerName: string,
  type = "0",
) {
  await writer.write(createTarHeader(
    headerName || path,
    size <= MAX_TAR_OCTAL_SIZE ? size : 0,
    modifiedAt,
    type,
  ));
  const reader = body.getReader();
  let written = 0;
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      const bytes = chunk.value;
      if (!(bytes instanceof Uint8Array) || written + bytes.byteLength > size) {
        throw new Error("MEDIA_BACKUP_OBJECT_SIZE_MISMATCH");
      }
      written += bytes.byteLength;
      await writer.write(bytes);
      chunk = await reader.read();
    }
  } finally {
    reader.releaseLock();
  }
  if (written !== size) throw new Error("MEDIA_BACKUP_OBJECT_SIZE_MISMATCH");
  const padding = paddingFor(size);
  if (padding) await writer.write(new Uint8Array(padding));
}

function createTarHeader(
  name: string,
  size: number,
  modifiedAt: number,
  type: string,
) {
  const header = new Uint8Array(TAR_BLOCK_SIZE);
  writeText(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o600);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.max(0, Math.floor(modifiedAt / 1000)));
  header.fill(0x20, 148, 156);
  header[156] = type.charCodeAt(0);
  writeText(header, 257, 6, "ustar\0");
  writeText(header, 263, 2, "00");
  writeText(header, 265, 32, "miran");
  writeText(header, 297, 32, "miran");
  const checksum = header.reduce((sum, value) => sum + value, 0);
  const checksumText = checksum.toString(8).padStart(6, "0");
  writeText(header, 148, 6, checksumText);
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function writeText(
  target: Uint8Array,
  offset: number,
  length: number,
  value: string,
) {
  const bytes = encoder.encode(value);
  if (bytes.length > length) throw new Error("MEDIA_BACKUP_TAR_FIELD_TOO_LONG");
  target.set(bytes, offset);
}

function writeOctal(
  target: Uint8Array,
  offset: number,
  length: number,
  value: number,
) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("MEDIA_BACKUP_TAR_NUMBER_INVALID");
  }
  const octal = value.toString(8);
  if (octal.length > length - 1) throw new Error("MEDIA_BACKUP_TAR_NUMBER_INVALID");
  writeText(target, offset, length, `${octal.padStart(length - 1, "0")}\0`);
}

function createPaxRecord(name: string, value: string) {
  const body = `${name}=${value}\n`;
  let length = encoder.encode(`0 ${body}`).length;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const record = `${length} ${body}`;
    const actualLength = encoder.encode(record).length;
    if (actualLength === length) return record;
    length = actualLength;
  }
  throw new Error("MEDIA_BACKUP_PAX_LENGTH_INVALID");
}

function normalizeListedObject(object: R2Object): MediaBackupObject {
  if (!object.key || !Number.isSafeInteger(object.size) || object.size < 0 || !object.etag) {
    throw new Error("MEDIA_BACKUP_INVENTORY_INVALID");
  }
  const uploaded = object.uploaded.toISOString();
  return {
    key: object.key,
    size: object.size,
    etag: object.etag,
    uploaded,
    httpMetadata: normalizeHttpMetadata(object.httpMetadata),
    customMetadata: sortStringRecord(object.customMetadata),
  };
}

function normalizeHttpMetadata(metadata: R2HTTPMetadata | undefined) {
  if (!metadata) return {};
  return sortStringRecord({
    contentType: metadata.contentType,
    contentLanguage: metadata.contentLanguage,
    contentDisposition: metadata.contentDisposition,
    contentEncoding: metadata.contentEncoding,
    cacheControl: metadata.cacheControl,
    cacheExpiry: metadata.cacheExpiry?.toISOString(),
  });
}

function sortStringRecord(value: Record<string, string | undefined> | undefined) {
  return Object.fromEntries(
    Object.entries(value ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeExportedAt(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("MEDIA_BACKUP_EXPORTED_AT_INVALID");
  return parsed.toISOString();
}

function sameInventory(
  initial: readonly MediaBackupObject[],
  final: readonly MediaBackupObject[],
) {
  return JSON.stringify(initial) === JSON.stringify(final);
}

function paddingFor(size: number) {
  return (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
}

function streamFromBytes(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
