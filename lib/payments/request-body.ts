/** Bound streamed payment input before allocating or parsing the complete body. */
export async function readPaymentRequestText(request: Request, maxBytes: number): Promise<string | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function readPaymentRequestJson(request: Request, maxBytes: number): Promise<unknown> {
  const body = await readPaymentRequestText(request, maxBytes);
  if (body === null) return null;
  try { return JSON.parse(body) as unknown; } catch { return null; }
}
