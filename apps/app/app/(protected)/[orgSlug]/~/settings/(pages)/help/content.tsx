'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  DiscordIcon,
  InstagramIcon,
  LinkedinIcon,
  SubstackIcon,
  TiktokIcon,
  XTwitterIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import type { LinkItem } from '@props/settings/help-content.props';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import { Code, ExternalLink, FileText } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { LinkCard } from '@/components/ui/link-card';

const COMMUNITY: LinkItem[] = [
  {
    icon: DiscordIcon,
    label: 'Discord',
    url: EnvironmentService.social.discord,
  },
  {
    icon: XTwitterIcon,
    label: 'X (Twitter)',
    url: EnvironmentService.social.twitter,
  },
  {
    icon: InstagramIcon,
    label: 'Instagram',
    url: EnvironmentService.social.instagram,
  },
  {
    icon: TiktokIcon,
    label: 'TikTok',
    url: EnvironmentService.social.tiktok,
  },
  {
    icon: LinkedinIcon,
    label: 'LinkedIn',
    url: EnvironmentService.social.linkedin,
  },
];

function HelpLinkCard({ item }: { item: LinkItem }) {
  return (
    <LinkCard
      href={item.url}
      icon={item.icon}
      title={item.label}
      className="p-4 no-underline text-sm"
      trailingIcon={
        <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
      }
    />
  );
}

export default function SettingsHelpPage() {
  const translate = useTranslations('pages.about');
  const resources: LinkItem[] = [
    {
      icon: FileText,
      label: translate('changelog'),
      url: 'https://genfeed.ai/changelog',
    },
    {
      icon: FileText,
      label: translate('documentation'),
      url: 'https://docs.genfeed.ai',
    },
    {
      icon: Code,
      label: translate('apiReference'),
      url: 'https://docs.genfeed.ai/api',
    },
    {
      icon: SubstackIcon,
      label: 'Substack',
      url: EnvironmentService.social.substack,
    },
  ];
  return (
    <div className="space-y-4">
      <Button asChild>
        <Link href={APP_ROUTES.SETTINGS.ABOUT}>{translate('title')}</Link>
      </Button>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{translate('helpResources')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((item) => (
            <HelpLinkCard key={item.label} item={item} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{translate('helpCommunity')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMMUNITY.map((item) => (
            <HelpLinkCard key={item.label} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
