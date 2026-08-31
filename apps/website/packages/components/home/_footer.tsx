import type { FooterSection } from '@ui/footers';
import { SiteFooter } from '@ui/footers';

/**
 * A navigation aid, not a sitemap: one destination per row, no duplicates, and
 * legal links only in the bottom bar. Guarded by `_footer.spec.tsx`.
 */
export const WEBSITE_SECTIONS: FooterSection[] = [
  {
    links: [
      { href: '/studio', label: 'Studio' },
      { href: '/publishing', label: 'Publishing' },
      { href: '/workflows', label: 'Workflows' },
      { href: '/analytics', label: 'Analytics' },
      { href: '/hire-agents', label: 'Hire Agents' },
      { href: '/integrations', label: 'Integrations' },
    ],
    title: 'Product',
  },
  {
    links: [
      { href: '/use-cases/creators', label: 'For Creators' },
      { href: '/use-cases/agencies', label: 'For Agencies' },
      { href: '/use-cases', label: 'All Use Cases' },
      { href: '/cloud', label: 'Teams' },
      { href: '/pricing', label: 'Pricing' },
    ],
    title: 'Solutions',
  },
  {
    links: [
      { href: '/docs', label: 'Docs' },
      { href: '/agent', label: 'Genfeed Agent' },
      { href: '/mcp', label: 'MCP Server' },
      { href: '/self-hosted', label: 'Self-host' },
      { href: '/articles', label: 'Blog' },
      { href: '/faq', label: 'FAQ' },
    ],
    title: 'Resources',
  },
  {
    links: [
      { href: '/about', label: 'About' },
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
