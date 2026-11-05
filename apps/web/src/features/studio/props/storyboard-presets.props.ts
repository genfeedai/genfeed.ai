import type { StudioStoryboardProposal } from '@genfeedai/contracts/api-types/contracts';
import type { LucideIcon } from 'lucide-react';

export type StoryboardPresetFormat = '9:16' | '16:9' | '1:1';

export type StoryboardPresetId = 'productLaunch' | 'founderStory' | 'beforeAfter';

/** One ready-to-run storyboard starting point. Titles live in i18n by `id`. */
export interface StoryboardPreset {
  id: StoryboardPresetId;
  /** Brand-neutral brief sent as the storyboard source (max 2000 chars). */
  brief: string;
  format: StoryboardPresetFormat;
  /** Runtime budget in seconds (max 60). */
  runtimeBudgetSeconds: number;
  /** Rough shot count the brief is written around. */
  shotCount: number;
  icon: LucideIcon;
  /** 16:9 storyboard-sheet thumbnail served from the app's public folder. */
  thumbnailSrc: string;
}

/**
 * The three starters on the storyboard landing: the agent's briefs for the
 * brand, or the brand-neutral presets when it has none.
 */
export interface StoryboardStarterCardsProps {
  /** Preset whose brief is currently in the composer, highlighted as selected. */
  activePresetId?: StoryboardPresetId;
  brandId?: string;
  isDisabled?: boolean;
  onSelectBrief: (proposal: StudioStoryboardProposal) => void;
  onSelectPreset: (preset: StoryboardPreset) => void;
}

export type StoryboardPitchKind = 'slideshow' | 'longForm';

export type StoryboardPitchId =
  | 'tips'
  | 'howTo'
  | 'story'
  | 'voiceNote'
  | 'lessons'
  | 'explainer';

/** A starter idea that fills the brief box. Titles live in i18n by `id`. */
export interface StoryboardPitch {
  id: StoryboardPitchId;
  /** Brand-neutral brief placed in the composer. */
  brief: string;
  icon: LucideIcon;
}

export interface StoryboardPitchCardsProps {
  isDisabled?: boolean;
  kind: StoryboardPitchKind;
  onSelect: (pitch: StoryboardPitch) => void;
}
