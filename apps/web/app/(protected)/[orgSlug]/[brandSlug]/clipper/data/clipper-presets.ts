import {
  GraduationCap,
  Lightbulb,
  Mic,
  Presentation,
  UserRound,
  Users,
} from 'lucide-react';
import type { ClipperPreset } from '@/features/clipper/props/clipper-presets.props';

/**
 * Brand-neutral starting settings for a new clip project. Titles and
 * descriptions are i18n under `pages.studioClipper.presets.items.<id>`. A preset
 * never carries a source: the creator adds a link or file on the New page.
 */
export const CLIPPER_PRESETS: readonly ClipperPreset[] = [
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
export function findClipperPreset(
  id: string | null | undefined,
): ClipperPreset | undefined {
  return CLIPPER_PRESETS.find((preset) => preset.id === id);
}
