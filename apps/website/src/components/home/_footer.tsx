import type { FooterSection } from '@web-components/footers';
import { SiteFooter } from '@web-components/footers';

/**
 * A navigation aid, not a sitemap: one destination per row, no duplicates, and
 * legal links only in the bottom bar. Guarded by `_footer.spec.tsx`.
 *
 * Product and Solutions mirror the topbar's groups, so a page lives under the
 * same heading at the top and the bottom of the site. The six personas stay in
 * the topbar's Use Cases menu; the footer points at their hub instead.
 */
export const WEBSITE_SECTIONS: FooterSection[] = [
  {
    links: [
      { href: '/products', label: 'Products' },
      { href: '/products/playground', label: 'Playground' },
      { href: '/products/publishing', label: 'Publishing' },
      { href: '/models', label: 'Models' },
      { href: '/integrations', label: 'Integrations' },
    ],
    title: 'Product',
  },
  {
    links: [
      // First: the most asked-for destination on the site.
      { href: '/pricing', label: 'Pricing' },
      { href: '/use-cases', label: 'Use Cases' },
      { href: '/cloud', label: 'Teams' },
      { href: '/hire-agents', label: 'Hire Agents' },
      { href: '/done-for-you', label: 'Done For You' },
    ],
    title: 'Solutions',
  },
  {
    links: [
      { href: 'https://docs.genfeed.ai', label: 'Docs' },
      { href: '/mcp', label: 'MCP Server' },
      { href: '/agent', label: 'Genfeed Agent' },
      { href: '/self-hosted', label: 'Self-host' },
      { href: '/claude', label: 'Claude' },
      { href: '/claude-code', label: 'Claude Code' },
      { href: '/codex', label: 'Codex' },
    ],
    title: 'Developers',
  },
  {
    links: [
      { href: '/about', label: 'About' },
      { href: '/affiliates', label: 'Affiliates' },
      { href: '/articles', label: 'Blog' },
      { href: '/contact', label: 'Contact' },
    ],
    title: 'Company',
  },
];

export default function HomeFooter(): React.ReactElement {
  return (
    <SiteFooter sections={WEBSITE_SECTIONS} showNewsletter variant="default" />
  );
}
