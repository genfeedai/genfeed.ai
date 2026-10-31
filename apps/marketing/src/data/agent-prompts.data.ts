import type { AgentPrompt } from '@props/website/home.props';

/**
 * What people ask the agent for, and what lands in the workspace.
 *
 * This replaced the format inventory on the homepage. A grid of eight formats
 * reads as "we do everything", which is the weakest possible claim and invites
 * a feature-by-feature comparison against a single-purpose tool. A request the
 * reader recognises as their own job does not.
 *
 * Every entry points at the audience page that continues its promise, so an
 * article about one of these jobs has somewhere to land other than the
 * homepage.
 */
export const AGENT_PROMPTS: AgentPrompt[] = [
  {
    ask: 'Make me a TikTok slideshow about this product',
    href: '/use-cases/creators',
    hrefLabel: 'For creators',
    result: 'Six slide drafts, a hook, caption and CTA, ready for review.',
  },
  {
    ask: 'Twenty ad variants for this client, 9:16 and 1:1',
    href: '/use-cases/agencies',
    hrefLabel: 'For agencies',
    result:
      'A batch in every ratio, on their brand, waiting in review before anything ships.',
  },
  {
    ask: 'Turn this video into an article and post it',
    href: '/use-cases/founders',
    hrefLabel: 'For founders',
    result:
      'An article draft in your voice and a generated cover, ready for review.',
  },
  {
    ask: 'Run this persona for a month',
    href: '/use-cases/ai-influencers',
    hrefLabel: 'For AI influencers',
    result:
      'A month of posts in one face and one voice, ready for review and scheduling.',
  },
  {
    ask: 'Create five angles for this campaign',
    href: '/use-cases/marketers',
    hrefLabel: 'For marketers',
    result:
      'Five angles ready for review, with available performance data after publishing.',
  },
  {
    ask: 'Shoot this product for every channel',
    href: '/use-cases/ecommerce',
    hrefLabel: 'For e-commerce',
    result:
      'Stills, video, and copy per platform, from the product you already sell.',
  },
];
