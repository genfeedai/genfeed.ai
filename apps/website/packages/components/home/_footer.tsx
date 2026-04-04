import { EnvironmentService } from '@services/core/environment.service';
import type { FooterSection } from '@ui/footers';
import { SiteFooter } from '@ui/footers';

const WEBSITE_SECTIONS: FooterSection[] = [
  {
    links: [
      { href: '/studio', label: 'Studio' },
      { href: '/publisher', label: 'Publisher' },
      { href: '/intelligence', label: 'Intelligence' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/host', label: 'Host' },
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
    ],
    title: 'Products',
  },
  {
    links: [
      { href: '/creators', label: 'For Creators' },
      { href: '/agencies', label: 'For Agencies' },
      { href: '/influencers', label: 'AI Influencers' },
      { href: '/cloud', label: 'Cloud' },
      { href: '/core', label: 'Open Source' },
    ],
    title: 'Solutions',
  },
  {
    links: [
      { href: '/vs/canva', label: 'vs Canva' },
      { href: '/vs/runway', label: 'vs Runway' },
      { href: '/vs/buffer', label: 'vs Buffer' },
      { href: '/vs/jasper', label: 'vs Jasper' },
    ],
    title: 'Compare',
  },
  {
    links: [
      { href: '/articles', label: 'Blog' },
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
      { external: true, href: EnvironmentService.github.org, label: 'GitHub' },
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
        brandTagline="The Content OS for agencies. Run research, creation, publishing, and tracking in one workflow."
      />
    </footer>
  );
}
