import type { ClipperResultMode } from '@genfeedai/contracts/interfaces';
import type { StudioPresetLayout } from '@genfeedai/props/studio/studio-presets.props';
import type { LucideIcon } from 'lucide-react';

export type ClipperPresetId =
  | 'podcastHighlights'
  | 'webinarSnippets'
  | 'interviewSoundbites'
  | 'tutorialTips'
  | 'keynoteMoments'
  | 'avatarRemix';

/** Starting settings for a new clip project. Titles live in i18n by `id`. */
export interface ClipperPreset {
  icon: LucideIcon;
  id: ClipperPresetId;
  /** Upper bound of highlights to find (1 to 30). */
  maxClips: number;
  /** Lowest virality score a highlight may have (0 to 100). */
  minViralityScore: number;
  mode: ClipperResultMode;
}

export interface ClipperPresetGridProps {
  layout?: StudioPresetLayout;
  presets: readonly ClipperPreset[];
}

export interface ClipperSourceBarProps {
  clipCount: number;
}
