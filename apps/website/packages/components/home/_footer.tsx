import type { FooterSection } from '@ui/footers';
import { SiteFooter } from '@ui/footers';

const WEBSITE_SECTIONS: FooterSection[] = [
  {
    links: [
      { href: '/pricing', label: 'Cloud App' },
      { href: '/cloud', label: 'Cloud Teams' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/features', label: 'Features' },
      { href: '/intelligence', label: 'Analytics' },
      { href: '/mobile', label: 'Mobile App' },
    ],
    title: 'Products',
  },
  {
    links: [
      { href: '/use-cases/creators', label: 'For Creators' },
      { href: '/use-cases/agencies', label: 'For Agencies' },
      { href: '/use-cases/ai-influencers', label: 'AI Influencers' },
      { href: '/use-cases/ecommerce', label: 'For E-Commerce' },
      { href: '/use-cases/marketers', label: 'For Marketers' },
      { href: '/use-cases/founders', label: 'For Founders' },
      { href: '/services', label: 'Services' },
      { href: '/pricing', label: 'Pricing' },
    ],
    title: 'Solutions',
  },
  {
    links: [
      { href: '/mcp', label: 'MCP Server' },
      { href: '/cursor', label: 'Cursor Extension' },
      { href: '/extension', label: 'Chrome Extension' },
      { href: '/chatgpt', label: 'ChatGPT' },
      { href: '/skills', label: 'Skills' },
      { href: '/docs', label: 'Docs' },
      {
        external: true,
        href: 'https://github.com/genfeedai/genfeed.ai',
        label: 'GitHub',
      },
    ],
    title: 'Developers',
  },
  {
    links: [
      { href: '/vs/canva', label: 'vs Canva' },
      { href: '/vs/runway', label: 'vs Runway' },
      { href: '/vs/buffer', label: 'vs Buffer' },
      { href: '/vs/jasper', label: 'vs Jasper' },
      { href: '/vs', label: 'All Comparisons' },
    ],
    title: 'Compare',
  },
  {
    links: [
      { href: '/articles', label: 'Blog' },
      { href: '/posts', label: 'Posts' },
      { href: '/faq', label: 'FAQ' },
      {
        external: true,
        href: 'https://docs.genfeed.ai',
        label: 'Documentation',
      },
      { href: '/demo', label: 'Demo' },
    ],
    title: 'Resources',
  },
  {
    links: [
      { href: '/about', label: 'About' },
      { href: '/gen', label: '$GEN Token' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
    title: 'Company',
  },
];

export default function HomeFooter(): React.ReactElement {
  return (
    <footer className="border-t gen-border">
      <SiteFooter
        sections={WEBSITE_SECTIONS}
        variant="default"
        showNewsletter
        showBookCall
        brandTagline="Managed AI content workspace. Start with the cloud app, then pay as you go for output."
      />
    </footer>
  );
}
