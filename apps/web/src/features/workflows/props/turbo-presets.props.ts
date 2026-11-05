import type { TurboIdeaFormat } from '@genfeedai/contracts/interfaces';
import type { LucideIcon } from 'lucide-react';

export type TurboPresetId = 'weeklyMix' | 'videoShorts' | 'avatarExplainers';

/** What a starter fills into the composer: the angle, the formats and the batch size. */
export interface TurboStarter {
  /** Creative angle sent to the idea generator (max 300 chars). */
  angle: string;
  /** Total ideas, spread across the formats (at least 3). */
  count: number;
  formats: readonly TurboIdeaFormat[];
}

/** One brand-neutral starter for an idea project. Titles live in i18n by `id`. */
export interface TurboPreset extends TurboStarter {
  icon: LucideIcon;
  id: TurboPresetId;
}

export interface TurboPresetCardsProps {
  brandId?: string;
  isDisabled?: boolean;
  /** Called with the chosen starter and its translated title. */
  onSelect: (starter: TurboStarter, title: string) => void;
}
