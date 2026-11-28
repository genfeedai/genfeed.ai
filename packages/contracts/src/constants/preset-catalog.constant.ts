import type { PresetExample } from '../interfaces/elements/preset-example.interface';
import { AD_PRESETS } from './ad-presets.constant';
import { B2B_PLAYBOOKS } from './b2b-playbooks.constant';
import { CINEMATIC_SHORTS } from './cinematic-shorts.constant';
import { PRESET_EXAMPLE_DATA } from './preset-catalog.generated';
import { STUDIO_SYSTEM_PRESETS } from './studio-system-presets.constant';

export type PresetCatalogKind = 'ad' | 'b2b' | 'cinematic' | 'studio';

export type PresetCatalogEntry = {
  description: string;
  /** Real runs of the preset, up to three; none until its example is made. */
  examples: readonly PresetExample[];
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
const WITHOUT_EXAMPLES: readonly Omit<PresetCatalogEntry, 'examples'>[] = [
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

export const PRESET_CATALOG: readonly PresetCatalogEntry[] =
  WITHOUT_EXAMPLES.map((preset) => ({
    ...preset,
    examples: PRESET_EXAMPLE_DATA[preset.key] ?? [],
  }));
