export async function hasValidUploadSignature(file: File, extension: string) {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  switch (extension) {
    case "jpg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "png":
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (value, index) => bytes[index] === value,
      );
    case "webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
    case "avif":
      return ascii(4, 4) === "ftyp" && /avif|avis/.test(ascii(8, 24));
    case "heic":
    case "heif":
      return (
        ascii(4, 4) === "ftyp" &&
        /heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1/.test(
          ascii(8, 24),
        )
      );
    case "mp4":
      return ascii(4, 4) === "ftyp";
    case "webm":
      return (
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
      );
    case "pdf":
      return ascii(0, 5) === "%PDF-";
    default:
      return false;
  }
}
