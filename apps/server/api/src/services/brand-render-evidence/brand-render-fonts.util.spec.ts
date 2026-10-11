import {
  FontRegistry,
  parseFontFamilies,
  requestedFamily,
} from '@api/services/brand-render-evidence/brand-render-fonts.util';
import type { VisualRenderObservations } from '@api/services/brand-render-evidence/visual-render-observations.util';
import { describe, expect, it } from 'vitest';

type FontFace = VisualRenderObservations['fontFaces'][number];

const fontHash = `sha256:${'a'.repeat(64)}`;
const otherHash = `sha256:${'b'.repeat(64)}`;
const staged = new Map([['brand-font', fontHash]]);

function face(overrides: Partial<FontFace> = {}): FontFace {
  return {
    family: 'BrandSans',
    style: 'normal',
    weight: '700',
    platformFamily: 'Brand Sans',
    source: { kind: 'asset', assetId: 'brand-font', contentHash: fontHash },
    ...overrides,
  };
}
const custom = (glyphCount = 10) => ({
  familyName: 'Brand Sans',
  postScriptName: 'BrandSans-Bold',
  isCustomFont: true,
  glyphCount,
});
const system = (familyName: string, glyphCount = 10) => ({
  familyName,
  postScriptName: null,
  isCustomFont: false,
  glyphCount,
});

describe('font family declarations', () => {
  it('splits a computed list and honours quotes', () => {
    expect(parseFontFamilies('"Brand, Sans", Inter, sans-serif')).toEqual([
      'Brand, Sans',
      'Inter',
      'sans-serif',
    ]);
    expect(parseFontFamilies("'A B',c")).toEqual(['A B', 'c']);
  });

  it('names the first non-generic family, or none', () => {
    expect(requestedFamily('sans-serif, "Inter", serif')).toBe('Inter');
    expect(requestedFamily('system-ui, sans-serif')).toBeNull();
  });
});

describe('FontRegistry', () => {
  it('ties a web font to the owned asset the API staged', () => {
    const registry = new FontRegistry([face()], staged);
    const usage = registry.useFonts('layer-1', 'BrandSans, serif', [custom()]);
    expect(usage).toEqual([{ fontId: 'font-1', glyphCount: 10 }]);
    expect(registry.fonts).toEqual([
      {
        id: 'font-1',
        family: 'Brand Sans',
        postScriptName: 'BrandSans-Bold',
        declaredFamily: 'BrandSans',
        weight: 700,
        style: 'normal',
        source: { kind: 'asset', assetId: 'brand-font', contentHash: fontHash },
        glyphCount: 10,
      },
    ]);
    expect(registry.fallbacks).toEqual([]);
  });

  it('records a requested family that did not render as a fallback', () => {
    const registry = new FontRegistry([], staged);
    registry.useFonts('layer-1', 'BrandSans, sans-serif', [
      system('DejaVu Sans', 12),
    ]);
    expect(registry.fallbacks).toEqual([
      {
        layerId: 'layer-1',
        requestedFamily: 'BrandSans',
        usedFontId: 'font-1',
        glyphCount: 12,
        reason: 'family_unavailable',
      },
    ]);
    expect(registry.fonts[0].source).toEqual({
      kind: 'system',
      contentHash: null,
    });
    expect(registry.fonts[0].declaredFamily).toBeNull();
  });

  it('flags the glyphs another font drew when the requested one lacked them', () => {
    const registry = new FontRegistry([face()], staged);
    registry.useFonts('layer-1', 'BrandSans', [
      custom(9),
      system('Noto Color Emoji', 1),
    ]);
    expect(registry.fallbacks).toHaveLength(1);
    expect(registry.fallbacks[0]).toMatchObject({
      usedFontId: 'font-2',
      glyphCount: 1,
      reason: 'glyph_not_covered',
    });
  });

  it('treats a generics-only declaration as unproven, not as a brand font', () => {
    const registry = new FontRegistry([], staged);
    registry.useFonts('layer-1', 'sans-serif', [system('DejaVu Sans')]);
    expect(registry.fallbacks).toEqual([
      expect.objectContaining({
        requestedFamily: null,
        reason: 'generic_family_only',
      }),
    ]);
  });

  it('does not match a requested family case-sensitively', () => {
    const registry = new FontRegistry([], staged);
    registry.useFonts('layer-1', 'dejavu sans', [system('DejaVu Sans')]);
    expect(registry.fallbacks).toEqual([]);
  });

  it('keeps a font unknown when its bytes are not the staged asset', () => {
    const forged = face({
      source: { kind: 'asset', assetId: 'brand-font', contentHash: otherHash },
    });
    const registry = new FontRegistry([forged], staged);
    registry.useFonts('layer-1', 'BrandSans', [custom()]);
    expect(registry.fonts[0].source).toEqual({
      kind: 'unknown',
      contentHash: null,
    });
  });

  it('keeps a font unknown when its asset was never authorised', () => {
    const registry = new FontRegistry([face()], new Map());
    registry.useFonts('layer-1', 'BrandSans', [custom()]);
    expect(registry.fonts[0].source.kind).toBe('unknown');
  });

  it('accepts an embedded font by the hash of its decoded bytes', () => {
    const embedded = face({
      source: { kind: 'embedded', assetId: null, contentHash: otherHash },
    });
    const registry = new FontRegistry([embedded], staged);
    registry.useFonts('layer-1', 'BrandSans', [custom()]);
    expect(registry.fonts[0].source).toEqual({
      kind: 'embedded',
      contentHash: otherHash,
    });
  });

  it('does not guess between two font files behind one family name', () => {
    const second = face({
      weight: '400',
      source: { kind: 'asset', assetId: 'brand-font', contentHash: otherHash },
    });
    const registry = new FontRegistry([face(), second], staged);
    registry.useFonts('layer-1', 'BrandSans', [custom()]);
    expect(registry.fonts[0].source.kind).toBe('unknown');
    expect(registry.diagnostics.has('font_source_ambiguous')).toBe(true);
  });

  describe('a family with several weights', () => {
    const regular = face({
      weight: '400',
      source: { kind: 'embedded', assetId: null, contentHash: otherHash },
    });
    const bold = face({ weight: '700' });
    const boldFont = {
      ...custom(),
      postScriptName: 'BrandSans-Bold',
    };

    it('picks the file for the requested weight', () => {
      const registry = new FontRegistry([regular, bold], staged);
      registry.useFonts('layer-1', 'BrandSans', [boldFont], {
        weight: 700,
        style: 'normal',
      });
      expect(registry.fonts[0]).toMatchObject({
        declaredFamily: 'BrandSans',
        weight: 700,
        source: { kind: 'asset', assetId: 'brand-font' },
      });
      expect(registry.fallbacks).toEqual([]);
    });

    it('accepts a variable weight range and the bold keyword', () => {
      const range = face({ weight: '100 900' });
      const registry = new FontRegistry(
        [face({ weight: 'bold' }), { ...regular, weight: '100 300' }],
        staged,
      );
      registry.useFonts('layer-1', 'BrandSans', [boldFont], {
        weight: 700,
        style: null,
      });
      expect(registry.fonts[0].source.kind).toBe('asset');
      const variable = new FontRegistry([range, regular], staged);
      variable.useFonts('layer-1', 'BrandSans', [boldFont], {
        weight: 600,
        style: null,
      });
      expect(variable.fonts[0].source.kind).toBe('asset');
    });

    it('does not call the brand font a fallback when only its file is ambiguous', () => {
      const registry = new FontRegistry([regular, bold], staged);
      registry.useFonts('layer-1', 'BrandSans', [boldFont]);
      expect(registry.fonts[0]).toMatchObject({
        declaredFamily: 'BrandSans',
        source: { kind: 'unknown', contentHash: null },
      });
      expect(registry.fallbacks).toEqual([]);
      expect(registry.diagnostics.has('font_source_ambiguous')).toBe(true);
    });
  });

  it('leaves fonts unknown when the engine did not report them', () => {
    const registry = new FontRegistry([], staged);
    expect(registry.useFonts('layer-1', 'BrandSans', null)).toEqual([]);
    expect(registry.fallbacks).toEqual([]);
    expect(registry.fonts).toEqual([]);
    expect(registry.diagnostics.has('font_engine_report_unavailable')).toBe(
      true,
    );
  });

  it('reuses one font entry across layers and adds up its glyphs', () => {
    const registry = new FontRegistry([], staged);
    registry.useFonts('layer-1', 'Arial', [system('Arial', 4)]);
    registry.useFonts('layer-2', 'Arial', [system('Arial', 6)]);
    expect(registry.fonts).toHaveLength(1);
    expect(registry.fonts[0].glyphCount).toBe(10);
  });
});
