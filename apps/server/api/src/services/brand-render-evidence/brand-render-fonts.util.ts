import type { VisualRenderObservations } from '@api/services/brand-render-evidence/visual-render-observations.util';
import type {
  BrandRenderEvidenceFontFallbackV1,
  BrandRenderEvidenceFontSourceV1,
  BrandRenderEvidenceFontV1,
} from '@genfeedai/contracts/interfaces/content/brand-render-evidence.interface';

type Capture = VisualRenderObservations['captures'][number];
type FontFace = VisualRenderObservations['fontFaces'][number];
type PlatformFont = NonNullable<
  Capture['textLayers'][number]['platformFonts']
>[number];

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

/** Splits a computed `font-family` list, honouring quotes. */
export function parseFontFamilies(declaration: string): string[] {
  const families: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const char of declaration) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ',') {
      families.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  families.push(current.trim());
  return families.filter(Boolean);
}

/** The first family the author named, or null when only generics were asked for. */
export function requestedFamily(declaration: string): string | null {
  return (
    parseFontFamilies(declaration).find(
      (family) => !GENERIC_FAMILIES.has(family.toLowerCase()),
    ) ?? null
  );
}

function sameFamily(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function parseWeight(weight: string): number | null {
  return /^\d{1,4}$/.test(weight) ? Number(weight) : null;
}

function parseStyle(style: string): 'normal' | 'italic' | 'oblique' | null {
  return style === 'normal' || style === 'italic' || style === 'oblique'
    ? style
    : null;
}

function fontSource(
  face: FontFace | undefined,
  stagedAssets: ReadonlyMap<string, string>,
): BrandRenderEvidenceFontSourceV1 {
  if (!face) return { kind: 'unknown', contentHash: null };
  const { source } = face;
  if (source.kind === 'asset') {
    const staged = source.assetId ? stagedAssets.get(source.assetId) : null;
    // The hash must be of bytes the API sent; a name alone proves nothing.
    return source.assetId && staged && staged === source.contentHash
      ? { kind: 'asset', assetId: source.assetId, contentHash: staged }
      : { kind: 'unknown', contentHash: null };
  }
  return source.kind === 'embedded' && source.contentHash
    ? { kind: 'embedded', contentHash: source.contentHash }
    : { kind: 'unknown', contentHash: null };
}

/**
 * Collects every font the engine rendered across the inspected frames and the
 * text layers' use of them. A font is identified by what the engine reported plus
 * where its bytes came from, so two files sharing a family name stay distinct.
 */
export class FontRegistry {
  readonly fonts: BrandRenderEvidenceFontV1[] = [];
  readonly fallbacks: BrandRenderEvidenceFontFallbackV1[] = [];
  readonly diagnostics = new Set<string>();
  private readonly byKey = new Map<string, string>();

  constructor(
    private readonly faces: readonly FontFace[],
    private readonly stagedAssets: ReadonlyMap<string, string>,
  ) {}

  /** Returns the manifest font id for a platform font drawn by a layer. */
  private fontId(font: PlatformFont, declaredFamilies: readonly string[]) {
    const face = font.isCustomFont
      ? this.faceFor(font.familyName, declaredFamilies)
      : undefined;
    const source = font.isCustomFont
      ? fontSource(face, this.stagedAssets)
      : ({ kind: 'system', contentHash: null } as const);
    const key = JSON.stringify([
      font.familyName,
      font.postScriptName,
      font.isCustomFont,
      face?.family ?? null,
      source,
    ]);
    const known = this.byKey.get(key);
    if (known) return known;
    const id = `font-${this.fonts.length + 1}`;
    this.byKey.set(key, id);
    this.fonts.push({
      id,
      family: font.familyName,
      postScriptName: font.postScriptName,
      declaredFamily: face?.family ?? null,
      weight: face ? parseWeight(face.weight) : null,
      style: face ? parseStyle(face.style) : null,
      source,
      glyphCount: 0,
    });
    return id;
  }

  /** The @font-face the engine reports for a web font, when exactly one fits. */
  private faceFor(
    platformFamily: string,
    declaredFamilies: readonly string[],
  ): FontFace | undefined {
    const candidates = this.faces.filter(
      (face) => face.platformFamily === platformFamily,
    );
    const named = candidates.filter((face) =>
      declaredFamilies.some((family) => sameFamily(family, face.family)),
    );
    const pool = named.length > 0 ? named : candidates;
    const sources = new Set(pool.map((face) => JSON.stringify(face.source)));
    if (pool.length > 0 && sources.size === 1) return pool[0];
    if (pool.length > 1) this.diagnostics.add('font_source_ambiguous');
    return undefined;
  }

  /**
   * Resolves one layer's reported fonts. `null` means the engine did not report
   * and the layer's fonts stay unknown.
   */
  useFonts(
    layerId: string,
    declaration: string,
    platformFonts: readonly PlatformFont[] | null,
  ): { fontId: string; glyphCount: number }[] {
    if (platformFonts === null) {
      this.diagnostics.add('font_engine_report_unavailable');
      return [];
    }
    const families = parseFontFamilies(declaration);
    const requested = requestedFamily(declaration);
    const usage = platformFonts.map((font) => {
      const fontId = this.fontId(font, families);
      const known = this.fonts.find((candidate) => candidate.id === fontId);
      if (known) known.glyphCount += font.glyphCount;
      return { font, fontId, declared: known?.declaredFamily ?? null };
    });
    const matches = (entry: (typeof usage)[number]) =>
      requested !== null &&
      sameFamily(entry.declared ?? entry.font.familyName, requested);
    const isRequestedUsed = usage.some(matches);
    for (const entry of usage) {
      if (matches(entry)) continue;
      this.fallbacks.push({
        layerId,
        requestedFamily: requested,
        usedFontId: entry.fontId,
        glyphCount: entry.font.glyphCount,
        reason:
          requested === null
            ? 'generic_family_only'
            : isRequestedUsed
              ? 'glyph_not_covered'
              : 'family_unavailable',
      });
    }
    return usage.map((entry) => ({
      fontId: entry.fontId,
      glyphCount: entry.font.glyphCount,
    }));
  }
}
