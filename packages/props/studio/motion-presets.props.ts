import type { LucideIcon } from 'lucide-react';
import type { StudioPresetLayout } from './studio-presets.props';

export type MotionPresetId =
  | 'kineticQuote'
  | 'statCounter'
  | 'lowerThird'
  | 'featureCallouts'
  | 'logoReveal'
  | 'barChart';

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

export interface MotionPresetGridProps {
  appliedPresetId?: MotionPresetId;
  layout?: StudioPresetLayout;
  onApply: (preset: MotionPreset) => void;
  presets: readonly MotionPreset[];
}

export interface MotionFramePreviewProps {
  durationFrames: number;
  height: number;
  width: number;
}

export interface MotionPresetPanelProps {
  appliedPresetId?: MotionPresetId;
  /** True before the creator has any Motion project: show the full intro. */
  isFirstRun: boolean;
  onApply: (preset: MotionPreset) => void;
}
