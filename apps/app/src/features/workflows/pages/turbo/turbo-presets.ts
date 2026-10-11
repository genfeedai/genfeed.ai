import type { TurboPreset } from '@genfeedai/props/studio/turbo-presets.props';
import {
  CalendarDays,
  Clapperboard,
  Images,
  Megaphone,
  MessageCircleQuestion,
  UserRound,
} from 'lucide-react';

/**
 * Brand-neutral idea projects for the Turbo landing. Angles are content sent to
 * the idea generator, so they stay here; titles and descriptions are i18n under
 * `pages.turboProjects.presets.items.<id>`.
 */
export const TURBO_PRESETS: readonly TurboPreset[] = [
  {
    angle:
      'A balanced week of posts: one product highlight, one practical tip, one behind-the-scenes moment and one customer-focused story.',
    count: 6,
    formats: ['image', 'video'],
    icon: CalendarDays,
    id: 'weeklyMix',
  },
  {
    angle:
      'Scroll-stopping videos of about fifteen seconds, each built around one strong opening hook and a single clear takeaway.',
    count: 6,
    formats: ['video'],
    icon: Clapperboard,
    id: 'videoShorts',
  },
  {
    angle:
      'Talking-head explainers where a presenter answers the questions customers ask most often, in plain language and under thirty seconds.',
    count: 3,
    formats: ['avatar'],
    icon: UserRound,
    id: 'avatarExplainers',
  },
  {
    angle:
      'Clean still images with a bold headline and one clear idea each, easy to read at a glance in a crowded feed.',
    count: 9,
    formats: ['image'],
    icon: Images,
    id: 'imageBatch',
  },
  {
    angle:
      'A launch countdown in four beats: tease, reveal, social proof and last call, each with a distinct hook.',
    count: 6,
    formats: ['image', 'video'],
    icon: Megaphone,
    id: 'launchCountdown',
  },
  {
    angle:
      'Myth busting: name a common misconception in the niche, then correct it in one sentence and show the proof.',
    count: 3,
    formats: ['video', 'avatar'],
    icon: MessageCircleQuestion,
    id: 'mythBusting',
  },
];
