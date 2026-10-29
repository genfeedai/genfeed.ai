import fs from 'node:fs';

interface FontMetrics {
  advances: Map<number, number>;
  defaultAdvance: number;
  unitsPerEm: number;
}

const cache = new Map<string, FontMetrics | null>();

function readTables(buffer: Buffer): Map<string, number> {
  const tables = new Map<string, number>();
  const count = buffer.readUInt16BE(4);
  for (let index = 0; index < count; index += 1) {
    const entry = 12 + index * 16;
    tables.set(
      buffer.toString('latin1', entry, entry + 4),
      buffer.readUInt32BE(entry + 8),
    );
  }
  return tables;
}

/** Maps code points to glyph ids from a format 4 or format 12 cmap subtable. */
function readCmap(buffer: Buffer, cmapOffset: number): Map<number, number> {
  const glyphs = new Map<number, number>();
  const subtableCount = buffer.readUInt16BE(cmapOffset + 2);
  let chosen: { format: number; offset: number } | null = null;
  for (let index = 0; index < subtableCount; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    const platform = buffer.readUInt16BE(record);
    const encoding = buffer.readUInt16BE(record + 2);
    const offset = cmapOffset + buffer.readUInt32BE(record + 4);
    const format = buffer.readUInt16BE(offset);
    const isUnicode =
      platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!isUnicode || (format !== 4 && format !== 12)) continue;
    if (!chosen || format === 12) chosen = { format, offset };
  }
  if (!chosen) return glyphs;

  if (chosen.format === 12) {
    const groups = buffer.readUInt32BE(chosen.offset + 12);
    for (let index = 0; index < groups; index += 1) {
      const group = chosen.offset + 16 + index * 12;
      const start = buffer.readUInt32BE(group);
      const end = buffer.readUInt32BE(group + 4);
      const glyph = buffer.readUInt32BE(group + 8);
      for (let code = start; code <= end && code - start < 70000; code += 1) {
        glyphs.set(code, glyph + code - start);
      }
    }
    return glyphs;
  }

  const segments = buffer.readUInt16BE(chosen.offset + 6) / 2;
  const endCodes = chosen.offset + 14;
  const startCodes = endCodes + segments * 2 + 2;
  const deltas = startCodes + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  for (let segment = 0; segment < segments; segment += 1) {
    const end = buffer.readUInt16BE(endCodes + segment * 2);
    const start = buffer.readUInt16BE(startCodes + segment * 2);
    const delta = buffer.readInt16BE(deltas + segment * 2);
    const rangeOffset = buffer.readUInt16BE(rangeOffsets + segment * 2);
    for (let code = start; code <= end && code !== 0xffff; code += 1) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        const position =
          rangeOffsets + segment * 2 + rangeOffset + (code - start) * 2;
        if (position + 2 > buffer.length) continue;
        glyph = buffer.readUInt16BE(position);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) glyphs.set(code, glyph);
    }
  }
  return glyphs;
}

function loadMetrics(fontFile: string): FontMetrics | null {
  if (cache.has(fontFile)) return cache.get(fontFile) ?? null;
  let metrics: FontMetrics | null = null;
  try {
    const buffer = fs.readFileSync(fontFile);
    const tables = readTables(buffer);
    const head = tables.get('head');
    const hhea = tables.get('hhea');
    const hmtx = tables.get('hmtx');
    const cmap = tables.get('cmap');
    if (
      head !== undefined &&
      hhea !== undefined &&
      hmtx !== undefined &&
      cmap !== undefined
    ) {
      const unitsPerEm = buffer.readUInt16BE(head + 18);
      const metricCount = buffer.readUInt16BE(hhea + 34);
      const advanceOf = (glyph: number): number =>
        buffer.readUInt16BE(hmtx + Math.min(glyph, metricCount - 1) * 4);
      const advances = new Map<number, number>();
      for (const [code, glyph] of readCmap(buffer, cmap)) {
        advances.set(code, advanceOf(glyph));
      }
      if (unitsPerEm > 0 && advances.size > 0) {
        metrics = { advances, defaultAdvance: advanceOf(0), unitsPerEm };
      }
    }
  } catch {
    metrics = null;
  }
  cache.set(fontFile, metrics);
  return metrics;
}

/**
 * Width in pixels of `text` set in the TrueType font at `fontSize`, from the
 * glyph advances alone (no kerning). Returns `null` when the font file cannot be
 * read, so a caller can fall back to an estimate.
 */
export function measureTextWidth(
  fontFile: string,
  text: string,
  fontSize: number,
): number | null {
  const metrics = loadMetrics(fontFile);
  if (!metrics) return null;
  let units = 0;
  for (const character of text) {
    units +=
      metrics.advances.get(character.codePointAt(0) ?? 0) ??
      metrics.defaultAdvance;
  }
  return (units * fontSize) / metrics.unitsPerEm;
}
