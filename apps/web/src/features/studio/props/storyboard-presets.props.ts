import type { StudioStoryboardProposal } from '@genfeedai/contracts/api-types/contracts';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export type StoryboardPresetFormat = '9:16' | '16:9' | '1:1';

export type StoryboardPresetId =
  | 'productLaunch'
  | 'founderStory'
  | 'beforeAfter'
  | 'threeStepExplainer'
  | 'customerStory'
  | 'seasonRecap'
  | 'behindTheScenes'
  | 'howTo';

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

export interface StoryboardPresetGridProps {
  presets: readonly StoryboardPreset[];
  /** `grid` fills the width with cards; `row` is one compact scrolling row. */
  layout?: 'grid' | 'row';
}

export interface StoryboardPresetCardsProps {
  /** Preset whose brief is currently in the composer, highlighted as selected. */
  activePresetId?: StoryboardPresetId;
  isDisabled?: boolean;
  onSelect: (preset: StoryboardPreset) => void;
}

export interface StoryboardShotStripProps {
  format: StoryboardPresetFormat;
  shotCount: number;
}

export interface StoryboardPresetThumbnailProps {
  src: string;
  className?: string;
}

/** Agent-written storyboard briefs shown above the presets (#7341). */
export interface StoryboardAgentBriefsProps {
  brandId?: string;
  isDisabled?: boolean;
  onSelect: (proposal: StudioStoryboardProposal) => void;
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
  /** Pitch whose brief is currently in the composer, highlighted as selected. */
  activePitchId?: StoryboardPitchId;
  isDisabled?: boolean;
  /** One card per row, for a narrow agent column. */
  isStacked?: boolean;
  kind: StoryboardPitchKind;
  onSelect: (pitch: StoryboardPitch) => void;
}

export interface StoryboardCreateProps {
  /** Page actions shown in the result column's header on the agent layout. */
  actions?: ReactNode;
  /** Page label shown in the result column's header on the agent layout. */
  label?: string;
}
