import type { IBrandKitAssetCandidateValidation } from '@api/collections/brands/interfaces/brand-kit-import-candidate.interface';
import { assertUrlNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import type {
  IBrandKitAssetImportCandidate,
  IBrandKitDiagnostic,
} from '@genfeedai/contracts/interfaces';

export const BRAND_KIT_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const BRAND_KIT_ALLOWED_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/svg+xml',
  'image/webp',
]);
const BRAND_KIT_ALLOWED_EXTENSIONS = new Set([
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);
/**
 * Sites often publish their logo only as an SVG. The files service rasterizes
 * SVG uploads to PNG, so an imported SVG is stored, and recorded, as a PNG.
 */
const SVG_MIME_TYPE = 'image/svg+xml';
const SVG_EXTENSION = '.svg';
const SVG_STORED_MIME_TYPE = 'image/png';
const SVG_STORED_EXTENSION = '.png';

export function createBrandKitImportDiagnostic(
  code: string,
  message: string,
  severity: IBrandKitDiagnostic['severity'],
): IBrandKitDiagnostic {
  return { code, message, severity };
}

function readExtension(url: URL): string {
  const pathname = url.pathname.toLowerCase();
  const extensionStart = pathname.lastIndexOf('.');
  return extensionStart >= 0 ? pathname.slice(extensionStart) : '';
}

function readFileName(url: URL): string | undefined {
  const filename = url.pathname.split('/').filter(Boolean).at(-1);
  return filename ? decodeURIComponent(filename).slice(0, 180) : undefined;
}

/** The stored file name; an SVG is stored as a PNG, so its name follows. */
export function readStoredFileName(
  url: URL,
  isSvg: boolean,
): string | undefined {
  const filename = readFileName(url);
  if (!filename || !isSvg) {
    return filename;
  }
  return filename.toLowerCase().endsWith(SVG_EXTENSION)
    ? `${filename.slice(0, -SVG_EXTENSION.length)}${SVG_STORED_EXTENSION}`
    : filename;
}

export function validateBrandKitAssetCandidate(
  candidate: IBrandKitAssetImportCandidate,
): IBrandKitAssetCandidateValidation {
  const diagnostics: IBrandKitDiagnostic[] = [];
  const rawUrl = candidate.url ?? candidate.sourceUrl;
  let parsedUrl: URL | undefined;

  if (candidate.role !== 'reference' && candidate.referenceCategory) {
    diagnostics.push(
      createBrandKitImportDiagnostic(
        'brand_kit_asset_reference_category_requires_reference_role',
        'referenceCategory is only valid for reference assets.',
        'error',
      ),
    );
  }

  if (!rawUrl) {
    diagnostics.push(
      createBrandKitImportDiagnostic(
        'brand_kit_asset_missing_url',
        'Asset candidate requires a URL.',
        'error',
      ),
    );
  } else {
    try {
      parsedUrl = new URL(rawUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        diagnostics.push(
          createBrandKitImportDiagnostic(
            'brand_kit_asset_invalid_protocol',
            'Asset candidate URL must use http or https.',
            'error',
          ),
        );
      } else {
        assertUrlNotPrivate(parsedUrl.href);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Invalid asset candidate URL';
      diagnostics.push(
        createBrandKitImportDiagnostic(
          'brand_kit_asset_invalid_url',
          message,
          'error',
        ),
      );
    }
  }

  const normalizedMimeType = candidate.mimeType?.trim().toLowerCase();
  if (
    normalizedMimeType &&
    !BRAND_KIT_ALLOWED_MIME_TYPES.has(normalizedMimeType)
  ) {
    diagnostics.push(
      createBrandKitImportDiagnostic(
        'brand_kit_asset_unsupported_content_type',
        `${normalizedMimeType} is not supported for brand kit assets.`,
        'error',
      ),
    );
  }

  if (!normalizedMimeType && parsedUrl) {
    const extension = readExtension(parsedUrl);
    if (!BRAND_KIT_ALLOWED_EXTENSIONS.has(extension)) {
      diagnostics.push(
        createBrandKitImportDiagnostic(
          'brand_kit_asset_unknown_content_type',
          'Asset candidate must include a supported image MIME type or file extension.',
          'error',
        ),
      );
    }
  }

  const isSvg =
    normalizedMimeType === SVG_MIME_TYPE ||
    (!normalizedMimeType &&
      parsedUrl !== undefined &&
      readExtension(parsedUrl) === SVG_EXTENSION);

  return {
    diagnostics,
    isSvg,
    mimeType: isSvg ? SVG_STORED_MIME_TYPE : normalizedMimeType,
    url: parsedUrl ?? new URL('https://invalid.example'),
  };
}
