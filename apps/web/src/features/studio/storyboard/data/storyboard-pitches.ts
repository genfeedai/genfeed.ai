import {
  BookOpen,
  Lightbulb,
  ListOrdered,
  Mic,
  Route,
  Users,
} from 'lucide-react';
import type {
  StoryboardPitch,
  StoryboardPitchKind,
} from '@/features/studio/props/storyboard-presets.props';

/**
 * Starter ideas for the modes that have no preset cards. Briefs are content
 * sent to the planner, so they stay here; titles and descriptions are i18n
 * under `pages.studioStoryboard.pitches.items.<id>`.
 */
export const STORYBOARD_PITCHES: Record<
  StoryboardPitchKind,
  readonly StoryboardPitch[]
> = {
  longForm: [
    {
      brief:
        'A voice note about the biggest lesson I learned this year. Start with what I expected to happen, walk through what actually happened and the mistake that taught me the most, then end with the one thing I would tell someone just starting out.',
      icon: Mic,
      id: 'voiceNote',
    },
    {
      brief:
        'Five lessons from building something from nothing. For each lesson, give the short version, one real example from the work, and what I would do differently next time. Keep a conversational tone, as if talking to a friend.',
      icon: BookOpen,
      id: 'lessons',
    },
    {
      brief:
        'An explainer on an idea people in my field get wrong. Open with the common belief, explain why it falls short with a concrete example, then show the better way of thinking about it and what to try this week.',
      icon: Lightbulb,
      id: 'explainer',
    },
  ],
  slideshow: [
    {
      brief:
        'Five small habits that make a big difference. One habit per slide with a short, punchy headline and one line on why it works. Open with a hook slide that promises the payoff and close with a slide that asks people to save the post.',
      icon: ListOrdered,
      id: 'tips',
    },
    {
      brief:
        'A step-by-step guide to doing one useful thing from start to finish. Slide one names the result, each following slide is a single step with a clear instruction, and the last slide shows the finished outcome.',
      icon: Route,
      id: 'howTo',
    },
    {
      brief:
        'A short story told in slides: where I started, the moment things went wrong, what I changed and where I am now. One idea per slide, plain words, and a closing slide that invites people to share their own version.',
      icon: Users,
      id: 'story',
    },
  ],
};
