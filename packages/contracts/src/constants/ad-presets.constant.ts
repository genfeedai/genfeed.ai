import type { AdPreset } from '../api-types/contracts/ad-preset.contract';
import { AD_PRESET_DATA } from './preset-catalog.generated';

export const AD_PRESET_AUDIO_NOTICE =
  'Reference audio steers the voice. There is no unchanged-audio guarantee.';

/** Defined in genfeedai/presets and pinned into `presets/`; see `scripts/sync-product-presets.ts`. */
export const AD_PRESETS = AD_PRESET_DATA as unknown as AdPreset[];

export function adPresetId(key: string): string {
  return `cpresetbuiltin${key.replaceAll('-', '')}`;
}
