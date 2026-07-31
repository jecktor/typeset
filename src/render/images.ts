import type { PDFDocument, PDFImage } from 'pdf-lib';

export function sniffImageType(bytes: Uint8Array): 'png' | 'jpg' | null {
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }
  return null;
}

/** Embed by sniffed type, falling back to the other decoder (some hosts lie). */
export async function embedImage(
  doc: PDFDocument,
  bytes: Uint8Array
): Promise<PDFImage> {
  const type = sniffImageType(bytes);
  try {
    return type === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return type === 'png' ? doc.embedJpg(bytes) : doc.embedPng(bytes);
  }
}
