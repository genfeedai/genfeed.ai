import type { LucideIcon } from 'lucide-react';

export type MotionPresetId = 'kineticQuote' | 'statCounter' | 'lowerThird';

/** A compose-form starting point. Titles live in i18n by `id`. */
export interface MotionPreset {
  /** Frame count at 30 fps (max 900). */
  durationFrames: number;
  height: number;
  icon: LucideIcon;
  id: MotionPresetId;
  /** Brand-neutral prompt sent to the author model (max 8 KB). */
  prompt: string;
  width: number;
}

export interface MotionPromptCardsProps {
  isDisabled?: boolean;
  /** Called with the chosen starter; it only fills the form. */
  onSelect: (preset: MotionPreset) => void;
}
