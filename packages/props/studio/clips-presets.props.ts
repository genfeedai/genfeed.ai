import type { ClipResultMode } from '@genfeedai/contracts/interfaces';
import type { LucideIcon } from 'lucide-react';
import type { StudioPresetLayout } from './studio-presets.props';

export type ClipsPresetId =
  | 'podcastHighlights'
  | 'webinarSnippets'
  | 'interviewSoundbites'
  | 'tutorialTips'
  | 'keynoteMoments'
  | 'avatarRemix';

/** Starting settings for a new clip project. Titles live in i18n by `id`. */
export interface ClipsPreset {
  icon: LucideIcon;
  id: ClipsPresetId;
  /** Upper bound of highlights to find (1 to 30). */
  maxClips: number;
  /** Lowest virality score a highlight may have (0 to 100). */
  minViralityScore: number;
  mode: ClipResultMode;
}

export interface ClipsPresetGridProps {
  layout?: StudioPresetLayout;
  presets: readonly ClipsPreset[];
}

export interface ClipsSourceBarProps {
  clipCount: number;
}
