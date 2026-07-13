import fs from 'node:fs/promises';
import path from 'node:path';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
};

const ASSET_EXTENSION_BY_MIME: Record<string, string> = {
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

const startsWithBytes = (bytes: Buffer, signature: number[]): boolean =>
  signature.every((value, index) => bytes[index] === value);

const hasIsoBaseMediaBrand = (bytes: Buffer, brands: string[]): boolean =>
  bytes.length >= 12 &&
  bytes.toString('ascii', 4, 8) === 'ftyp' &&
  brands.includes(bytes.toString('ascii', 8, 12));

const isMimeSignatureValid = (bytes: Buffer, mimeType: string): boolean => {
  switch (mimeType) {
    case 'application/octet-stream':
      return true;
    case 'application/pdf':
      return bytes.toString('ascii', 0, 5) === '%PDF-';
    case 'audio/mpeg':
      return (
        bytes.toString('ascii', 0, 3) === 'ID3' ||
        (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
      );
    case 'audio/wav':
      return (
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WAVE'
      );
    case 'image/avif':
      return hasIsoBaseMediaBrand(bytes, ['avif', 'avis']);
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6));
    case 'image/jpeg':
      return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWithBytes(
        bytes,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      );
    case 'image/svg+xml': {
      const source = bytes.toString('utf8').trimStart().toLowerCase();
      return (
        (source.startsWith('<svg') || source.startsWith('<?xml')) &&
        !source.includes('<script') &&
        !source.includes('<foreignobject') &&
        !/\son[a-z]+\s*=/.test(source)
      );
    }
    case 'image/webp':
      return (
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP'
      );
    case 'video/mp4':
      return bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp';
    default:
      return false;
  }
};

export const inferDesktopAssetMimeType = (filePath: string): string =>
  MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ??
  'application/octet-stream';

export const extensionForDesktopAssetMimeType = (mimeType: string): string =>
  ASSET_EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? '.bin';

export const validateDesktopAssetMimeType = async (
  filePath: string,
  mimeType: string,
): Promise<boolean> => {
  if (inferDesktopAssetMimeType(filePath) !== mimeType) {
    return false;
  }

  const file = await fs.open(filePath, 'r');

  try {
    const bytes = Buffer.alloc(4096);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    return isMimeSignatureValid(bytes.subarray(0, bytesRead), mimeType);
  } finally {
    await file.close();
  }
};
