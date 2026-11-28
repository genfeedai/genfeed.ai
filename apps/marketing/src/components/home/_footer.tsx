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
      { href: '/products/publishing', label: 'Publishing' },
      { href: '/models', label: 'Models' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/tools', label: 'Free tools' },
    ],
    title: 'Product',
  },
  {
    links: [
      // First: the most asked-for destination on the site.
      { href: '/pricing', label: 'Pricing' },
      { href: '/use-cases', label: 'Use cases' },
      { href: '/cloud', label: 'Teams' },
      { href: '/hire-agents', label: 'Hire agents' },
      { href: '/done-for-you', label: 'Done for you' },
    ],
    title: 'Solutions',
  },
  {
    links: [
      { href: '/developers', label: 'Developer hub' },
      { href: 'https://docs.genfeed.ai', label: 'Docs' },
      { href: '/mcp', label: 'MCP server' },
      { href: '/agent', label: 'Connect Agent' },
      { href: '/self-hosted', label: 'Self-host' },
      { href: '/claude', label: 'Claude' },
      { href: '/skills', label: 'Agent skills' },
    ],
    title: 'Developers',
  },
  {
    links: [
      { href: '/about', label: 'About' },
      { href: '/affiliates', label: 'Affiliates' },
      { href: '/blog', label: 'Blog' },
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
