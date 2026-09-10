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
    result:
      'Six slides, the hook on slide one, caption and CTA written, queued to post.',
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
      'Transcribed, rewritten in your voice, cover image generated, scheduled.',
  },
  {
    ask: 'Run this persona for a month',
    href: '/use-cases/ai-influencers',
    hrefLabel: 'For AI influencers',
    result:
      'A month of posts in one face and one voice, published on its own schedule.',
  },
  {
    ask: 'Test this message five ways and tell me which converts',
    href: '/use-cases/marketers',
    hrefLabel: 'For marketers',
    result: 'Five angles live, then the revenue each one actually drove.',
  },
  {
    ask: 'Shoot this product for every channel',
    href: '/use-cases/ecommerce',
    hrefLabel: 'For e-commerce',
    result:
      'Stills, video, and copy per platform, from the product you already sell.',
  },
];
