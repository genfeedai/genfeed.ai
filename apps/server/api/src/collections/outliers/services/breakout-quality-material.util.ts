import { isBreakoutMediaFormat } from '@api/collections/outliers/services/breakout-media-format.util';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedPostMaterialLayout } from '@api/services/branded-generation-receipts/branded-generation-post-material.util';

/** The finished words of a post: its own text, then each text segment in order. */
export function breakoutLayoutText(
  layout: Readonly<BrandedPostMaterialLayout>,
): string {
  return [
    layout.textBytes,
    ...layout.entries.map((entry) =>
      entry.kind === 'text' ? entry.bytes : null,
    ),
  ]
    .filter((bytes): bytes is Uint8Array => bytes !== null)
    .map((bytes) => Buffer.from(bytes).toString('utf8'))
    .join('\n\n');
}

/**
 * Identity of the exact material a quality score was earned on. A text or thread keeps its
 * text hash. A visual post additionally binds its canonical layout digest, which carries each
 * attached asset's storage key and version, so replacing a visual (or the caption) invalidates
 * the score. Database-only, so the publication gate can recompute it inside its transaction.
 */
export function breakoutQualityMaterialHash(
  layout: Readonly<Pick<BrandedPostMaterialLayout, 'format' | 'layoutDigest'>>,
  text: string,
): string {
  return isBreakoutMediaFormat(layout.format)
    ? hashBrandedGenerationTextV1(`${text}\n${layout.layoutDigest}`)
    : hashBrandedGenerationTextV1(text);
}
