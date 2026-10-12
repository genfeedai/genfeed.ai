import { createHash } from 'node:crypto';
import { FONT_UPLOAD_MAX_BYTES } from '@api/collections/brands/utils/brand-font-upload.util';
import { VISUAL_CODE_FONT_MIME_TYPES } from '@genfeedai/contracts/constants';
import type { IVisualSandboxFontFace } from '@genfeedai/contracts/interfaces';

export type BrandFontMimeType = (typeof VISUAL_CODE_FONT_MIME_TYPES)[number];

/** Smallest file that can hold an sfnt or woff header and one table. */
export const BRAND_FONT_MIN_BYTES = 48;
export const BRAND_FONT_MAX_BYTES = FONT_UPLOAD_MAX_BYTES;

/**
 * A family becomes a CSS string in the renderer, so only plain names pass. This
 * mirrors `FONT_FAMILY_PATTERN` in scripts/visual-code/protocol.mjs, which
 * rejects the same input again inside the sandbox.
 */
const FONT_FAMILY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,99}$/u;

export class BrandFontFileError extends Error {
  constructor(
    readonly code:
      | 'visual_brand_font_format_unsupported'
      | 'visual_brand_font_size_invalid'
      | 'visual_brand_font_signature_mismatch'
      | 'visual_brand_font_hash_mismatch',
  ) {
    super(code);
    this.name = 'BrandFontFileError';
  }
}

export function isBrandFontMimeType(
  value: unknown,
): value is BrandFontMimeType {
  return (
    typeof value === 'string' &&
    (VISUAL_CODE_FONT_MIME_TYPES as readonly string[]).includes(value)
  );
}

export function isBrandFontFamily(value: unknown): value is string {
  return typeof value === 'string' && FONT_FAMILY_PATTERN.test(value);
}

export function isBrandFontFace(face: IVisualSandboxFontFace): boolean {
  return (
    isBrandFontFamily(face.family) &&
    Number.isInteger(face.weight) &&
    face.weight >= 100 &&
    face.weight <= 900
  );
}

function hasSignature(bytes: Buffer, mime: BrandFontMimeType): boolean {
  const tag = bytes.toString('ascii', 0, 4);
  switch (mime) {
    case 'font/woff2':
      return tag === 'wOF2';
    case 'font/woff':
      return tag === 'wOFF';
    case 'font/otf':
      return tag === 'OTTO';
    case 'font/ttf':
      // A TrueType sfnt is version 1.0 or the Apple tag "true".
      return (
        bytes.length >= 4 &&
        (bytes.readUInt32BE(0) === 0x00010000 || tag === 'true')
      );
  }
}

/** Whether a stored size is one the platform will stage. */
export function isBrandFontSize(size: unknown): size is number {
  return (
    typeof size === 'number' &&
    Number.isInteger(size) &&
    size >= BRAND_FONT_MIN_BYTES &&
    size <= BRAND_FONT_MAX_BYTES
  );
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Checks bytes read from storage against what the Brand OS revision approved: the
 * format must be one the renderer loads, the size within bounds and equal to the
 * recorded size, the leading bytes must be that format's signature, and the
 * digest must equal the approved hash. Anything else is refused, never repaired.
 */
export function assertBrandFontBytes(
  bytes: Buffer,
  expected: { mimeType: string; sizeBytes: number; sha256: string },
): void {
  if (!isBrandFontMimeType(expected.mimeType))
    throw new BrandFontFileError('visual_brand_font_format_unsupported');
  if (!isBrandFontSize(bytes.length) || bytes.length !== expected.sizeBytes)
    throw new BrandFontFileError('visual_brand_font_size_invalid');
  if (!hasSignature(bytes, expected.mimeType))
    throw new BrandFontFileError('visual_brand_font_signature_mismatch');
  if (sha256Hex(bytes) !== expected.sha256)
    throw new BrandFontFileError('visual_brand_font_hash_mismatch');
}
