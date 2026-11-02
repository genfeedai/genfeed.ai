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
