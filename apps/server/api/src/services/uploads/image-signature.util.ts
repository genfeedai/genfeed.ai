const ASCII = (text: string): number[] =>
  [...text].map((character) => character.charCodeAt(0));

const PNG = [0x89, ...ASCII('PNG'), 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF87 = ASCII('GIF87a');
const GIF89 = ASCII('GIF89a');
const RIFF = ASCII('RIFF');
const WEBP = ASCII('WEBP');
const WEBP_OFFSET = 8;

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  return prefix.every((value, index) => bytes[offset + index] === value);
}

/**
 * The image format a file really is, from its first bytes. Returns the file
 * extension a public path would use, or undefined for anything else, including
 * SVG and text that only claims to be an image.
 */
export function detectImageExtension(
  head: Uint8Array,
): 'gif' | 'jpg' | 'png' | 'webp' | undefined {
  if (startsWith(head, PNG)) return 'png';
  if (startsWith(head, JPEG)) return 'jpg';
  if (startsWith(head, GIF87) || startsWith(head, GIF89)) return 'gif';
  if (startsWith(head, RIFF) && startsWith(head, WEBP, WEBP_OFFSET)) {
    return 'webp';
  }
  return undefined;
}
