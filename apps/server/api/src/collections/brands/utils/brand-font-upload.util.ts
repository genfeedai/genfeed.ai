import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
export const FONT_UPLOAD_MAX_BYTES = 4194304;
export const FONT_UPLOAD_MIN_BYTES = 48;
interface ValidatedBrandFontUpload {
  buffer: Buffer;
  sizeBytes: number;
  sha256: string;
  originalFileName: string;
  displayName: string | null;
}
interface BrandFontCursor {
  createdAt: string;
  id: string;
}
interface BrandFontValidationInput {
  requestId: string;
  displayName?: string;
  file: Express.Multer.File;
}
function isControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code < 32 || (code >= 127 && code <= 159);
}
const invalid = () => new BadRequestException('font_asset_invalid');
export function normalizeBrandFontFileName(value: string): string {
  if (typeof value !== 'string') throw invalid();
  const basename = value.replace(/\\/g, '/').split('/').at(-1) ?? '';
  if (!/\.woff2$/i.test(basename)) throw invalid();
  const name = Array.from(
    Array.from(basename)
      .filter((character) => !isControl(character))
      .join('')
      .trim(),
  )
    .slice(0, 256)
    .join('');
  if (!name || !/\.woff2$/i.test(name)) throw invalid();
  return name;
}
export function validateBrandFontUpload(
  input: BrandFontValidationInput,
): ValidatedBrandFontUpload {
  if (
    !input ||
    typeof input.requestId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      input.requestId,
    )
  )
    throw invalid();
  const file = input.file;
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.length < FONT_UPLOAD_MIN_BYTES ||
    file.buffer.length > FONT_UPLOAD_MAX_BYTES ||
    file.size !== file.buffer.length ||
    !['font/woff2', 'application/octet-stream'].includes(file.mimetype) ||
    !file.buffer.subarray(0, 4).equals(Buffer.from('wOF2', 'ascii'))
  )
    throw invalid();
  const displayName =
    input.displayName === undefined
      ? null
      : typeof input.displayName === 'string'
        ? input.displayName.trim()
        : '';
  if (displayName !== null && (!displayName || displayName.length > 256))
    throw invalid();
  return {
    buffer: file.buffer,
    sizeBytes: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    originalFileName: normalizeBrandFontFileName(file.originalname),
    displayName,
  };
}
export function computeBrandFontUploadId(
  orgId: string,
  brandId: string,
  requestId: string,
): string {
  return (
    'c' +
    createHash('sha256')
      .update(
        JSON.stringify(['brand-font-upload-v1', orgId, brandId, requestId]),
      )
      .digest('hex')
      .slice(0, 24)
  );
}
export function encodeBrandFontCursor(value: BrandFontCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: value.createdAt, id: value.id }),
    'utf8',
  ).toString('base64url');
}
export function parseBrandFontCursor(value: string): BrandFontCursor {
  if (
    typeof value !== 'string' ||
    value.length > 2112 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw invalid();
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length > 1584) throw invalid();
    const parsed: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw invalid();
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(',') !== 'createdAt,id' ||
      typeof record.createdAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.createdAt) ||
      new Date(record.createdAt).toISOString() !== record.createdAt ||
      typeof record.id !== 'string' ||
      !record.id ||
      record.id.length > 256 ||
      Array.from(record.id).some(isControl)
    )
      throw invalid();
    const cursor = { createdAt: record.createdAt, id: record.id };
    if (encodeBrandFontCursor(cursor) !== value) throw invalid();
    return cursor;
  } catch {
    throw invalid();
  }
}
