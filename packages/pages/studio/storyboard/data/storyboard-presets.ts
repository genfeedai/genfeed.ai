import type { CreateStoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardPreset } from '@genfeedai/props/studio/storyboard-presets.props';
import {
  Calendar,
  Camera,
  GraduationCap,
  Layers,
  ListOrdered,
  MessageSquareQuote,
  Rocket,
  UserRound,
} from 'lucide-react';

/**
 * Brand-neutral starting points for the Storyboard landing and create page.
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
  {
    brief:
      'A three-step explainer. Hook with the one problem the viewer wants solved, walk through step one, step two and step three with a clear on-screen label for each, and finish on the outcome they get and what to do next.',
    format: '16:9',
    icon: ListOrdered,
    id: 'threeStepExplainer',
    runtimeBudgetSeconds: 30,
    shotCount: 5,
    thumbnailSrc: '/storyboard-presets/threeStepExplainer.webp',
  },
  {
    brief:
      'A customer testimonial in a casual, user-generated style. A real-feeling person talks to camera about what was not working, what changed after trying the product, and the result they noticed, cut with candid B-roll of them using it.',
    format: '9:16',
    icon: MessageSquareQuote,
    id: 'customerStory',
    runtimeBudgetSeconds: 25,
    shotCount: 4,
    thumbnailSrc: '/storyboard-presets/customerStory.webp',
  },
  {
    brief:
      'A recap of an event or season. Open on the build-up and the first arrivals, move through the biggest moments and crowd reactions, then end on a warm closing shot with a teaser for what is coming next.',
    format: '16:9',
    icon: Calendar,
    id: 'seasonRecap',
    runtimeBudgetSeconds: 45,
    shotCount: 6,
    thumbnailSrc: '/storyboard-presets/seasonRecap.webp',
  },
  {
    brief:
      'A behind-the-scenes look at how the work gets made. Show the workspace before anyone arrives, the messy middle with hands-on detail shots, a small unexpected moment of personality, and the finished piece revealed at the end.',
    format: '9:16',
    icon: Camera,
    id: 'behindTheScenes',
    runtimeBudgetSeconds: 30,
    shotCount: 5,
    thumbnailSrc: '/storyboard-presets/behindTheScenes.webp',
  },
  {
    brief:
      'A quick how-to tutorial. State what the viewer will be able to do by the end, show what they need, demonstrate each step in close-up with a short caption, and finish with the result and one pro tip.',
    format: '16:9',
    icon: GraduationCap,
    id: 'howTo',
    runtimeBudgetSeconds: 40,
    shotCount: 6,
    thumbnailSrc: '/storyboard-presets/howTo.webp',
  },
];

/** Same input the create page builds for a brief, so presets and manual runs match. */
export function buildStoryboardPresetInput(
  preset: StoryboardPreset,
): Omit<CreateStoryboardRun, 'clientRequestId'> {
  return {
    planSettings: {
      cast: [],
      format: preset.format,
      runtimeBudgetSeconds: preset.runtimeBudgetSeconds,
      styleReferenceAssetIds: [],
      videoModelKey: null,
    },
    source: { brief: preset.brief, kind: 'brief' },
  };
}
