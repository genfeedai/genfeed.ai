'use client';

import {
  DiscordIcon,
  InstagramIcon,
  LinkedinIcon,
  SubstackIcon,
  TiktokIcon,
  XTwitterIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { EnvironmentService } from '@services/core/environment.service';
import { Code, ExternalLink, FileText } from 'lucide-react';
import type { ComponentType } from 'react';

import { LinkCard } from '@/components/ui/link-card';

interface LinkItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  url: string;
}

const RESOURCES: LinkItem[] = [
  {
    icon: FileText,
    label: 'Documentation',
    url: 'https://docs.genfeed.ai',
  },
  {
    icon: Code,
    label: 'API Reference',
    url: 'https://docs.genfeed.ai/api',
  },
  {
    icon: SubstackIcon,
    label: 'Substack',
    url: EnvironmentService.social.substack,
  },
];

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
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Resources</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RESOURCES.map((item) => (
            <HelpLinkCard key={item.label} item={item} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Community</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMMUNITY.map((item) => (
            <HelpLinkCard key={item.label} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
