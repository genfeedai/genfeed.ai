import { AD_PRESETS } from './ad-presets.constant';
import { B2B_PLAYBOOKS } from './b2b-playbooks.constant';
import { CINEMATIC_SHORTS } from './cinematic-shorts.constant';
import { STUDIO_SYSTEM_PRESETS } from './studio-system-presets.constant';

export type PresetCatalogKind = 'ad' | 'b2b' | 'cinematic' | 'studio';

export type PresetCatalogEntry = {
  description: string;
  key: string;
  kind: PresetCatalogKind;
  label: string;
  prompt: string;
  type: 'image' | 'image-edit' | 'video';
  values: object;
};

/**
 * Every first-party preset in one list. The database seed writes it into the
 * `presets` table and the store sync turns it into shop listings, so a preset
 * is defined here once.
 */
export const PRESET_CATALOG: readonly PresetCatalogEntry[] = [
  ...STUDIO_SYSTEM_PRESETS.map((preset) => ({
    ...preset,
    kind: 'studio' as const,
  })),
  ...AD_PRESETS.map((preset) => ({
    description: preset.description,
    key: preset.key,
    kind: 'ad' as const,
    label: preset.label,
    prompt: '',
    type: 'video' as const,
    values: { adPreset: preset },
  })),
  ...CINEMATIC_SHORTS.map((cinematicShort) => ({
    description: cinematicShort.description,
    key: cinematicShort.key,
    kind: 'cinematic' as const,
    label: cinematicShort.label,
    prompt: '',
    type: 'video' as const,
    values: { cinematicShort },
  })),
  ...B2B_PLAYBOOKS.map((playbook) => ({
    description: playbook.description,
    key: playbook.key,
    kind: 'b2b' as const,
    label: playbook.label,
    prompt: '',
    type: playbook.mediaType,
    values: { playbook },
  })),
];
