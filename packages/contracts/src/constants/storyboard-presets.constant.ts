export const storyboardStarterFormats = ['9:16', '16:9', '1:1'] as const;
export const storyboardStarterIds = [
  'productLaunch',
  'founderStory',
  'beforeAfter',
] as const;

export type StoryboardStarterFormat = (typeof storyboardStarterFormats)[number];
export type StoryboardStarterId = (typeof storyboardStarterIds)[number];

export type StoryboardStarterPreset = {
  id: StoryboardStarterId;
  /** Brand-neutral brief sent as the storyboard source (max 2000 chars). */
  brief: string;
  format: StoryboardStarterFormat;
  /** Runtime budget in seconds (max 60). */
  runtimeBudgetSeconds: number;
  /** Rough shot count the brief is written around. */
  shotCount: number;
};

/**
 * Brand-neutral storyboard starting points. Studio shows them on the
 * Storyboard landing when the agent has no briefs for the brand yet; the MCP
 * server lists the same rows. Titles and descriptions are i18n in the web app
 * under `pages.studioStoryboard.presets.<id>`.
 */
export const STORYBOARD_STARTER_PRESETS: readonly StoryboardStarterPreset[] = [
  {
    brief:
      'A product launch teaser. Open on a tight close-up of the product hidden or half-revealed, build anticipation with fast cuts of its standout details in motion, then reveal it in full with a bold one-line promise and a clear call to action.',
    format: '9:16',
    id: 'productLaunch',
    runtimeBudgetSeconds: 15,
    shotCount: 5,
  },
  {
    brief:
      'A founder story told in first person. Start with the problem that sparked the idea, show the early scrappy days, the turning point when it started working, and close on the mission today with an invitation to follow along.',
    format: '9:16',
    id: 'founderStory',
    runtimeBudgetSeconds: 30,
    shotCount: 5,
  },
  {
    brief:
      'A before-and-after transformation. Show the frustrating starting point, the moment the change begins, and the finished result side by side, with a matching camera angle in every shot so the difference lands instantly.',
    format: '1:1',
    id: 'beforeAfter',
    runtimeBudgetSeconds: 20,
    shotCount: 3,
  },
];
