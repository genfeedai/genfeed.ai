/**
 * Metadata extension labels keyed by the upload's validated content type. The
 * content type is signed into the presigned URL, so it is a more reliable
 * source than the client-supplied filename. Labels match `MetadataExtension`.
 */
const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'audio/mp3': 'MP3',
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'audio/x-wav': 'WAV',
  'image/gif': 'GIF',
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPG',
  'image/png': 'PNG',
  // The files service rasterizes an SVG upload to PNG on confirm (#8991).
  'image/svg+xml': 'PNG',
  'image/webp': 'WEBP',
  'video/mp4': 'MP4',
  'video/quicktime': 'MOV',
  'video/webm': 'WEBM',
  'video/x-msvideo': 'AVI',
};

const DEFAULT_EXTENSION = 'jpg';

export function resolveUploadExtension(
  contentType: string,
  filename: string,
): string {
  const fromContentType =
    EXTENSION_BY_CONTENT_TYPE[contentType.trim().toLowerCase()];
  if (fromContentType) {
    return fromContentType;
  }

  const filenameParts = filename.split('.');
  const lastPart = filenameParts[filenameParts.length - 1];
  return filenameParts.length > 1 && lastPart ? lastPart : DEFAULT_EXTENSION;
}

/**
 * Display label for an upload. An SVG is stored as a PNG, so its label follows
 * the stored file instead of keeping a `.svg` name on a PNG asset.
 */
export function resolveUploadLabel(
  contentType: string,
  filename: string,
): string {
  return contentType.trim().toLowerCase() === 'image/svg+xml'
    ? filename.replace(/\.svg$/i, '.png')
    : filename;
}
