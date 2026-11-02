import type { TurboIdeaFormat } from '@genfeedai/contracts/interfaces';
import type { LucideIcon } from 'lucide-react';

export type TurboPresetId =
  | 'weeklyMix'
  | 'videoShorts'
  | 'avatarExplainers'
  | 'imageBatch'
  | 'launchCountdown'
  | 'mythBusting';

/** One starter for an idea project. Titles live in i18n by `id`. */
export interface TurboPreset {
  /** Creative angle sent to the idea generator (max 300 chars). */
  angle: string;
  /** Total ideas, spread across the formats (at least 3). */
  count: number;
  formats: readonly TurboIdeaFormat[];
  icon: LucideIcon;
  id: TurboPresetId;
}

export interface TurboPresetCardsProps {
  isDisabled?: boolean;
  /** Called with the chosen starter and its translated title. */
  onSelect: (preset: TurboPreset, title: string) => void;
}
