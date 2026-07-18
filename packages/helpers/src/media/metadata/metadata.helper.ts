import { cdnAsset } from '../cdn/cdn.helper';

export const metadata = {
  cards: {
    // Absolute CDN URL — social crawlers (OG/Twitter) fetch this directly.
    // A site-relative path here resolves against metadataBase (the site
    // domain) where the file does not exist.
    default: cdnAsset('/assets/cards/default.jpg'),
  },
  description:
    'Open-source distribution infrastructure for AI agents. Connect Claude Code or Codex through MCP, then approve, publish, and measure content from one human control plane.',
  keywords: [
    'genfeed',
    'genfeed.ai',
    'MCP',
    'AI agent distribution',
    'publisher',
    'analytics',
    'self-hosted',
  ],
  name: 'Genfeed.ai',
  url: 'https://genfeed.ai',
};
