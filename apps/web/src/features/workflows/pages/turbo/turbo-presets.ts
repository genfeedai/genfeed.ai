import { CalendarDays, Clapperboard, UserRound } from 'lucide-react';
import type { TurboPreset } from '@/features/workflows/props/turbo-presets.props';

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
];
