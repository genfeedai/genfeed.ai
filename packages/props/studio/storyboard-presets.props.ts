import type { LucideIcon } from 'lucide-react';

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
  /** Rough shot count the brief is written around; drives the shot strip. */
  shotCount: number;
  icon: LucideIcon;
}

export interface StoryboardPresetGridProps {
  presets: readonly StoryboardPreset[];
  /** `grid` fills the width with cards; `row` is one compact scrolling row. */
  layout?: 'grid' | 'row';
}

export interface StoryboardPresetChipsProps {
  isDisabled?: boolean;
  onSelect: (preset: StoryboardPreset) => void;
}

export interface StoryboardShotStripProps {
  format: StoryboardPresetFormat;
  shotCount: number;
}
