import type { FooterSection } from '@ui/footers';
import { SiteFooter } from '@ui/footers';

const WEBSITE_SECTIONS: FooterSection[] = [
  {
    links: [
      { href: '/studio', label: 'Studio' },
      { href: '/library', label: 'Library' },
      { href: '/publisher', label: 'Publisher' },
      { href: '/workflows', label: 'Workflows' },
      { href: '/analytics', label: 'Analytics' },
      { href: '/agents', label: 'Agents' },
    ],
    title: 'Product',
  },
  {
    links: [
      { href: '/use-cases/creators', label: 'For Creators' },
      { href: '/use-cases/agencies', label: 'For Agencies' },
      { href: '/use-cases/ecommerce', label: 'For E-Commerce' },
      { href: '/use-cases/founders', label: 'For Founders' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/services', label: 'Services' },
    ],
    title: 'Solutions',
  },
  {
    links: [
      { href: '/integrations', label: 'Integrations' },
      { href: '/skills', label: 'Skills' },
      {
        external: true,
        href: 'https://docs.genfeed.ai',
        label: 'Docs',
      },
      { href: '/self-hosted', label: 'Self-host' },
      { href: '/download', label: 'Desktop app' },
      { href: '/developers', label: 'Developers' },
    ],
    title: 'Build',
  },
  {
    links: [
      { href: '/about', label: 'About' },
      { href: '/articles', label: 'Articles' },
      { href: '/contact', label: 'Contact' },
      { href: '/faq', label: 'FAQ' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
    title: 'Company',
  },
];

export default function HomeFooter(): React.ReactElement {
  return (
    <SiteFooter
      sections={WEBSITE_SECTIONS}
      variant="default"
      showNewsletter
      brandTagline="The AI content studio. Generate, review, schedule, and publish every piece of content from one workspace."
    />
  );
}
