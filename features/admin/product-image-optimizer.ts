const PRODUCT_IMAGE_SECURITY_LIMIT_BYTES = 20_000_000;
const PRODUCT_IMAGE_OPTIMIZE_FROM_BYTES = 1_500_000;
const PRODUCT_IMAGE_TARGET_BYTES = 2_500_000;
const PRODUCT_IMAGE_MAX_DIMENSION = 2_400;

const supportedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/x-heic",
  "image/x-heif",
]);

const supportedFileExtensions = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "heic",
  "heif",
]);

export const PRODUCT_IMAGE_ACCEPT = "image/*,.heic,.heif";

export function productImageFileIdentity(file: Pick<File, "name" | "size" | "lastModified" | "type">) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`;
}

export function getProductImageValidationError(file: File) {
  if (file.size <= 0) return "فایل تصویر خالی است.";
  if (file.size > PRODUCT_IMAGE_SECURITY_LIMIT_BYTES) {
    return "حجم فایل از سقف امنیتی ۲۰ مگابایت بیشتر است.";
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type.toLowerCase();
  if (!supportedMimeTypes.has(mime) && !supportedFileExtensions.has(extension)) {
    return "فرمت تصویر پشتیبانی نمی‌شود. از JPG، PNG، WebP یا AVIF استفاده کنید؛ HEIC/HEIF فقط در مرورگر سازگار تبدیل می‌شود.";
  }
  return "";
}

export async function optimizeProductImageForWeb(file: File) {
  const validationError = getProductImageValidationError(file);
  if (validationError) throw new Error(validationError);

  const heifSource = /(?:heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
  const decoded = await decodeImage(file).catch(() => {
    throw new Error(
      heifSource
        ? "این مرورگر نتوانست تصویر HEIC/HEIF را بخواند. فایل را با Safari یا به‌صورت JPG/PNG بارگذاری کنید."
        : "خواندن تصویر ممکن نشد؛ سالم‌بودن فایل را بررسی کنید.",
    );
  });

  try {
    const largestSide = Math.max(decoded.width, decoded.height);
    const shouldOptimize =
      heifSource ||
      file.size > PRODUCT_IMAGE_OPTIMIZE_FROM_BYTES ||
      largestSide > PRODUCT_IMAGE_MAX_DIMENSION;
    if (!shouldOptimize) return file;

    const attempts = [
      { maxDimension: 2_400, quality: 0.84 },
      { maxDimension: 2_400, quality: 0.72 },
      { maxDimension: 1_800, quality: 0.78 },
      { maxDimension: 1_600, quality: 0.68 },
    ];
    let optimized: Blob | null = null;
    for (const attempt of attempts) {
      optimized = await renderImage(
        decoded.source,
        decoded.width,
        decoded.height,
        attempt.maxDimension,
        attempt.quality,
      );
      if (optimized.size <= PRODUCT_IMAGE_TARGET_BYTES) break;
    }
    if (!optimized) throw new Error("بهینه‌سازی تصویر ممکن نشد.");

    if (!heifSource && optimized.size >= file.size) return file;
    const extension = optimized.type === "image/webp" ? "webp" : "jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "product-image";
    return new File([optimized], `${baseName}.${extension}`, {
      type: optimized.type,
      lastModified: Date.now(),
    });
  } finally {
    decoded.dispose();
  }
}

async function decodeImage(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      // Safari can decode some camera formats through HTMLImageElement only.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => URL.revokeObjectURL(objectUrl),
  };
}

async function renderImage(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
  quality: number,
) {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("پردازش تصویر در این مرورگر ممکن نیست.");
  context.drawImage(source, 0, 0, width, height);

  const webp = await canvasToBlob(canvas, "image/webp", quality);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
  if (!jpeg) throw new Error("فشرده‌سازی تصویر ممکن نشد.");
  return jpeg;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}
