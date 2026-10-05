const WEBSITE_URL = 'https://genfeed.ai';

export const metadata = {
  cards: {
    // The website composes the headline over versioned CDN artwork.
    // Keep this absolute: consumers may have a different metadataBase.
    default: `${WEBSITE_URL}/og`,
  },
  // Says what Genfeed is before it says what it has: "AI content studio" is a
  // category every competitor also claims, and a scheduler is a category we
  // deliberately do not compete in. Lead with the agent and the outcome.
  description:
    'Genfeed is a content agent that makes on-brand videos, images and posts to grow your audience and your revenue. Works in Claude, ChatGPT, Codex and Cursor.',
  keywords: [
    'genfeed',
    'genfeed.ai',
    'AI content studio',
    'AI content generation',
    'AI content agent',
    'content marketing platform',
    'AI video generator',
  ],
  name: 'Genfeed.ai',
  url: WEBSITE_URL,
};
