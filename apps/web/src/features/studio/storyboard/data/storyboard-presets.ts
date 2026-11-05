import { Layers, Rocket, UserRound } from 'lucide-react';
import type { StoryboardPreset } from '@/features/studio/props/storyboard-presets.props';

/**
 * Brand-neutral starting points for the Storyboard landing, shown when the
 * agent has no briefs for the brand yet (three at most).
 * Briefs are content sent to the planner, so they stay here; titles and
 * descriptions are i18n under `pages.studioStoryboard.presets.<id>`.
 */
export const STORYBOARD_PRESETS: readonly StoryboardPreset[] = [
  {
    brief:
      'A product launch teaser. Open on a tight close-up of the product hidden or half-revealed, build anticipation with fast cuts of its standout details in motion, then reveal it in full with a bold one-line promise and a clear call to action.',
    format: '9:16',
    icon: Rocket,
    id: 'productLaunch',
    runtimeBudgetSeconds: 15,
    shotCount: 5,
    thumbnailSrc: '/storyboard-presets/productLaunch.webp',
  },
  {
    brief:
      'A founder story told in first person. Start with the problem that sparked the idea, show the early scrappy days, the turning point when it started working, and close on the mission today with an invitation to follow along.',
    format: '9:16',
    icon: UserRound,
    id: 'founderStory',
    runtimeBudgetSeconds: 30,
    shotCount: 5,
    thumbnailSrc: '/storyboard-presets/founderStory.webp',
  },
  {
    brief:
      'A before-and-after transformation. Show the frustrating starting point, the moment the change begins, and the finished result side by side, with a matching camera angle in every shot so the difference lands instantly.',
    format: '1:1',
    icon: Layers,
    id: 'beforeAfter',
    runtimeBudgetSeconds: 20,
    shotCount: 3,
    thumbnailSrc: '/storyboard-presets/beforeAfter.webp',
  },
];
