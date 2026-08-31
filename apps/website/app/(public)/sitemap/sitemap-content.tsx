import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';

type DirectoryLink = {
  readonly href: string;
  readonly label: string;
};

type DirectorySection = {
  readonly links: readonly DirectoryLink[];
  readonly title: string;
};

/**
 * Every public destination on the site, grouped.
 *
 * The global footer is a navigation aid — four groups, one destination per row
 * — so it deliberately carries only the paths most visitors need. This page is
 * the complete index behind it: hub pages (`/vs`, `/tools`, `/use-cases`,
 * `/integrations`) link their own children, so listing the hub here keeps every
 * page underneath it reachable by an internal link.
 *
 * `sitemap-content.spec.tsx` asserts this stays aligned with `app/sitemap.ts`,
 * so a route added to the XML sitemap cannot silently skip the directory.
 */
export const SITE_DIRECTORY: readonly DirectorySection[] = [
  {
    links: [
      { href: '/studio', label: 'Studio' },
      { href: '/publishing', label: 'Publishing' },
      { href: '/workflows', label: 'Workflows' },
      { href: '/analytics', label: 'Analytics' },
      { href: '/library', label: 'Library' },
      { href: '/calendar', label: 'Calendar' },
      { href: '/research', label: 'Research' },
      { href: '/hire-agents', label: 'Hire Agents' },
      { href: '/brand-os', label: 'Brand OS' },
      { href: '/gen', label: 'Gen' },
      { href: '/features', label: 'All features' },
    ],
    title: 'Product',
  },
  {
    links: [
      { href: '/agent', label: 'Genfeed Agent' },
      { href: '/mcp', label: 'MCP server' },
      { href: '/skills', label: 'Agent skills' },
      { href: '/chatgpt', label: 'ChatGPT integration' },
      { href: '/cursor', label: 'Cursor extension' },
      { href: '/extension', label: 'Chrome extension' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/self-hosted', label: 'Self-hosted' },
      { href: '/cloud', label: 'Cloud' },
      { href: '/download', label: 'Desktop app' },
      { href: '/mobile', label: 'Mobile app' },
      { href: '/docs', label: 'Documentation' },
    ],
    title: 'Agent and developers',
  },
  {
    links: [
      { href: '/use-cases', label: 'Use cases' },
      { href: '/use-cases/creators', label: 'For creators' },
      { href: '/use-cases/agencies', label: 'For agencies' },
      { href: '/use-cases/ai-influencers', label: 'For AI influencers' },
      { href: '/services', label: 'Services' },
      { href: '/vs', label: 'Genfeed vs alternatives' },
      { href: '/tools', label: 'Free tools' },
    ],
    title: 'Solutions and comparisons',
  },
  {
    links: [
      { href: '/pricing', label: 'Pricing' },
      { href: '/articles', label: 'Articles' },
      { href: '/posts', label: 'Posts by ingredient' },
      { href: '/demo', label: 'Product demo' },
      { href: '/faq', label: 'FAQ' },
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
    title: 'Resources and company',
  },
];

export default function SitemapContent(): React.ReactElement {
  return (
    <PageLayout
      compact
      description="Every public page on genfeed.ai, in one place."
      title="Sitemap"
    >
      <section className="container mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {SITE_DIRECTORY.map((section) => (
            <div key={section.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-surface/50">
                {section.title}
              </h2>
              <ul className="mt-5 space-y-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      className="text-sm text-surface/75 transition-colors hover:text-primary"
                      href={link.href}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </PageLayout>
  );
}
