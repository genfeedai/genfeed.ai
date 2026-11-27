import type { IPreset } from '../interfaces/elements/preset.interface';
import type { GenerationSetupValues } from '../interfaces/studio/generation-setup.interface';
import { STUDIO_SYSTEM_PRESET_DATA } from './preset-catalog.generated';

const ASPECT_RATIO_PATTERN = /^[1-9]\d*(?:\.\d+)?:[1-9]\d*(?:\.\d+)?$/;

/** Defined in genfeedai/catalog and pinned into `presets/`; see `scripts/sync-product-presets.ts`. */
export const STUDIO_SYSTEM_PRESETS = STUDIO_SYSTEM_PRESET_DATA;

export type StudioSystemPreset = {
  key: (typeof STUDIO_SYSTEM_PRESETS)[number]['key'];
  label: string;
  description: string;
  prompt: string;
  type: 'image' | 'image-edit' | 'video';
  values: Partial<GenerationSetupValues>;
};

export function studioSystemPresetId(key: StudioSystemPreset['key']): string {
  return `cpresetbuiltin${key.replaceAll('-', '')}`;
}

/** Only live platform rows with the reserved ID may supply a built-in template. */
export function resolveStudioSystemPresets(
  catalog: readonly Partial<IPreset>[],
  type: string,
): StudioSystemPreset[] {
  return STUDIO_SYSTEM_PRESETS.flatMap((seed): StudioSystemPreset[] => {
    const row = catalog.find(
      (preset) => preset.id === studioSystemPresetId(seed.key),
    );
    if (
      !row?.isActive ||
      row.isDeleted ||
      row.organizationId !== null ||
      row.brandId !== null ||
      row.category !== type ||
      (type !== 'image' && type !== 'image-edit' && type !== 'video') ||
      !row.label?.trim() ||
      typeof row.prompt !== 'string'
    )
      return [];
    // Older rows can omit the ratio. Invalid persisted ratios are never applied.
    // An edit keeps the source size, so it has no ratio to apply.
    const seedAspectRatio =
      'aspectRatio' in seed.values ? seed.values.aspectRatio : undefined;
    const aspectRatio =
      type === 'image-edit' ? undefined : row.aspectRatio || seedAspectRatio;
    if (
      (aspectRatio !== undefined && !ASPECT_RATIO_PATTERN.test(aspectRatio)) ||
      (row.duration != null &&
        (!Number.isFinite(row.duration) ||
          row.duration <= 0 ||
          row.duration > 3600))
    )
      return [];
    const values: StudioSystemPreset['values'] = aspectRatio
      ? { aspectRatio }
      : {};
    if (type !== 'image-edit' && row.duration != null)
      values.duration = row.duration;
    for (const field of [
      'camera',
      'cameraMovement',
      'lens',
      'lighting',
      'mood',
      'promptTemplate',
      'scene',
      'style',
    ] as const) {
      if (type !== 'image-edit' && typeof row[field] === 'string')
        values[field] = row[field];
    }
    return [
      {
        key: seed.key,
        label: row.label,
        description: row.description ?? '',
        prompt: row.prompt,
        type,
        values,
      },
    ];
  });
}
