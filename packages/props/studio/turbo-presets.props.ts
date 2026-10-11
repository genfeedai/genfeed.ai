import type { TurboIdeaFormat } from '@genfeedai/contracts/interfaces';
import type { LucideIcon } from 'lucide-react';
import type { StudioPresetLayout } from './studio-presets.props';

export type TurboPresetId =
  | 'weeklyMix'
  | 'videoShorts'
  | 'avatarExplainers'
  | 'imageBatch'
  | 'launchCountdown'
  | 'mythBusting';

/** One ready-to-run idea project. Titles live in i18n by `id`. */
export interface TurboPreset {
  /** Creative angle saved on the draft (max 300 chars). */
  angle: string;
  /** Ideas per format (3 to 9). */
  count: number;
  formats: readonly TurboIdeaFormat[];
  icon: LucideIcon;
  id: TurboPresetId;
}

export interface TurboPresetGridProps {
  layout?: StudioPresetLayout;
  presets: readonly TurboPreset[];
}

export interface TurboIdeaStripProps {
  count: number;
  formats: readonly TurboIdeaFormat[];
}
