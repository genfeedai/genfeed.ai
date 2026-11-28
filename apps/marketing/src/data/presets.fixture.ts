import {
  PRESET_CATALOG,
  type PresetCatalogEntry,
} from '@genfeedai/contracts/constants/preset-catalog.constant';
import type { PresetExample } from '@genfeedai/contracts/interfaces/elements/preset-example.interface';

/** An example the way the catalog will carry it, for a preset that makes `type`. */
export function exampleFor(
  preset: Pick<PresetCatalogEntry, 'key' | 'label' | 'type'>,
): PresetExample {
  const url = `https://cdn.genfeed.ai/presets/${preset.key}`;
  const alt = `A ${preset.label.toLowerCase()} made with the preset.`;

  if (preset.type === 'video')
    return {
      alt,
      aspectRatio: '9:16',
      mediaType: 'video',
      posterUrl: `${url}-poster.jpg`,
      url: `${url}.mp4`,
    };
  if (preset.type === 'image-edit')
    return {
      alt,
      aspectRatio: '1:1',
      mediaType: 'image',
      sourceUrl: `${url}-before.png`,
      url: `${url}.png`,
    };
  return { alt, aspectRatio: '1:1', mediaType: 'image', url: `${url}.png` };
}

/** The real catalog with an example on every preset, or only on the keys given. */
export function catalogWithExamples(
  keys?: readonly string[],
): PresetCatalogEntry[] {
  return PRESET_CATALOG.map((preset) => ({
    ...preset,
    examples: !keys || keys.includes(preset.key) ? [exampleFor(preset)] : [],
  }));
}
