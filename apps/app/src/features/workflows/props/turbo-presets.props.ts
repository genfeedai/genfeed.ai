import type { TurboIdeaFormat } from '@genfeedai/contracts/interfaces';
import type { StudioPresetLayout } from '@genfeedai/props/studio/studio-presets.props';
import type { LucideIcon } from 'lucide-react';

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
  /** Total ideas, spread across the formats (at least 3). */
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
