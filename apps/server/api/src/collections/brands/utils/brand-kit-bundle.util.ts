import type { UnpackedBrandKitBundle } from '@api/collections/brands/interfaces/brand-kit-bundle.interface';
import {
  BRAND_KIT_BUNDLE_FONT_MAX_BYTES,
  BRAND_KIT_BUNDLE_IMAGE_MAX_BYTES,
  BRAND_KIT_BUNDLE_MANIFEST_MAX_BYTES,
  BRAND_KIT_BUNDLE_MANIFEST_PATH,
  BRAND_KIT_BUNDLE_MAX_BYTES,
  BRAND_KIT_BUNDLE_UNPACKED_MAX_BYTES,
  type BrandKitBundleManifest,
  brandKitBundleManifestSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-kit-bundle.contract';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { type UnzipFileInfo, unzipSync, zipSync } from 'fflate';

/** Images and fonts are compressed already; only the manifest is deflated. */
const STORE = 0;
const DEFLATE = 6;

/** Build the ZIP: `manifest.json` first, then every file it names. */
export function packBrandKitBundle(
  manifest: BrandKitBundleManifest,
  files: ReadonlyMap<string, Buffer>,
): Buffer {
  const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    [BRAND_KIT_BUNDLE_MANIFEST_PATH]: [
      new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
      { level: DEFLATE },
    ],
  };
  for (const [path, bytes] of files) {
    entries[path] = [new Uint8Array(bytes), { level: STORE }];
  }
  return Buffer.from(zipSync(entries));
}

function invalid(code = 'brand_kit_bundle_invalid'): BadRequestException {
  return new BadRequestException(code);
}

function maxBytesFor(path: string): number {
  return path.startsWith('fonts/')
    ? BRAND_KIT_BUNDLE_FONT_MAX_BYTES
    : BRAND_KIT_BUNDLE_IMAGE_MAX_BYTES;
}

/**
 * Read an uploaded kit. Only `manifest.json` and the files it names are
 * unpacked, each within its size cap and all of them within one total, so a
 * ZIP that claims small sizes and inflates further cannot grow past them: the
 * inflater writes into a buffer of the declared size. Paths come from the
 * manifest's own pattern, never from the archive, so nothing is ever written
 * to disk or resolved against a directory.
 */
export function unpackBrandKitBundle(zip: Buffer): UnpackedBrandKitBundle {
  if (zip.length > BRAND_KIT_BUNDLE_MAX_BYTES) {
    throw new PayloadTooLargeException('brand_kit_bundle_too_large');
  }
  const data = new Uint8Array(zip.buffer, zip.byteOffset, zip.length);

  let manifestBytes: Uint8Array | undefined;
  try {
    manifestBytes = unzipSync(data, {
      filter: (file) =>
        file.name === BRAND_KIT_BUNDLE_MANIFEST_PATH &&
        fitsWithin(file, BRAND_KIT_BUNDLE_MANIFEST_MAX_BYTES),
    })[BRAND_KIT_BUNDLE_MANIFEST_PATH];
  } catch {
    throw invalid();
  }
  if (!manifestBytes) throw invalid('brand_kit_manifest_missing');

  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes),
    );
  } catch {
    throw invalid('brand_kit_manifest_invalid');
  }
  const parsed = brandKitBundleManifestSchema.safeParse(manifestJson);
  if (!parsed.success) throw invalid('brand_kit_manifest_invalid');
  const manifest = parsed.data;

  const wanted = new Set<string>([
    ...manifest.logos.map((entry) => entry.file),
    ...manifest.banners.map((entry) => entry.file),
    ...manifest.fonts.map((entry) => entry.file),
  ]);
  let unpackedBytes = 0;
  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(data, {
      filter: (file) => {
        if (!wanted.has(file.name)) return false;
        if (!fitsWithin(file, maxBytesFor(file.name))) return false;
        unpackedBytes += file.originalSize;
        return unpackedBytes <= BRAND_KIT_BUNDLE_UNPACKED_MAX_BYTES;
      },
    });
  } catch {
    throw invalid();
  }

  const files = new Map<string, Buffer>();
  for (const [path, bytes] of Object.entries(unpacked)) {
    if (bytes.length > 0 && bytes.length <= maxBytesFor(path)) {
      files.set(path, Buffer.from(bytes));
    }
  }
  return { files, manifest };
}

function fitsWithin(file: UnzipFileInfo, maxBytes: number): boolean {
  return file.size <= maxBytes && file.originalSize <= maxBytes;
}
