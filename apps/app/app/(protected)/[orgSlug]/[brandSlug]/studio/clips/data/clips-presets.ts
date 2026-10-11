import type { ClipsPreset } from '@genfeedai/props/studio/clips-presets.props';
import {
  GraduationCap,
  Lightbulb,
  Mic,
  Presentation,
  UserRound,
  Users,
} from 'lucide-react';

/**
 * Brand-neutral starting settings for a new clip project. Titles and
 * descriptions are i18n under `pages.studioClips.presets.items.<id>`. A preset
 * never carries a source: the creator adds a link or file on the New page.
 */
export const CLIPS_PRESETS: readonly ClipsPreset[] = [
  {
    icon: Mic,
    id: 'podcastHighlights',
    maxClips: 8,
    minViralityScore: 70,
    mode: 'raw-cut',
  },
  {
    icon: Presentation,
    id: 'webinarSnippets',
    maxClips: 6,
    minViralityScore: 60,
    mode: 'raw-cut',
  },
  {
    icon: Users,
    id: 'interviewSoundbites',
    maxClips: 10,
    minViralityScore: 65,
    mode: 'raw-cut',
  },
  {
    icon: GraduationCap,
    id: 'tutorialTips',
    maxClips: 5,
    minViralityScore: 60,
    mode: 'raw-cut',
  },
  {
    icon: Lightbulb,
    id: 'keynoteMoments',
    maxClips: 6,
    minViralityScore: 75,
    mode: 'raw-cut',
  },
  {
    icon: UserRound,
    id: 'avatarRemix',
    maxClips: 5,
    minViralityScore: 70,
    mode: 'avatar',
  },
];

/** Resolves the `preset` query param of the New page; unknown ids are ignored. */
export function findClipsPreset(
  id: string | null | undefined,
): ClipsPreset | undefined {
  return CLIPS_PRESETS.find((preset) => preset.id === id);
}
