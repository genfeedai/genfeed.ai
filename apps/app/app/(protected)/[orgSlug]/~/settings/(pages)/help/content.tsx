'use client';

import { EnvironmentService } from '@services/core/environment.service';
import type { ComponentType } from 'react';
import {
  FaDiscord,
  FaInstagram,
  FaLinkedin,
  FaTiktok,
  FaXTwitter,
} from 'react-icons/fa6';
import {
  HiArrowTopRightOnSquare,
  HiCodeBracket,
  HiDocumentText,
} from 'react-icons/hi2';
import { SiSubstack } from 'react-icons/si';
import { LinkCard } from '@/components/ui/link-card';

interface LinkItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  url: string;
}

const RESOURCES: LinkItem[] = [
  {
    icon: HiDocumentText,
    label: 'Documentation',
    url: 'https://docs.genfeed.ai',
  },
  {
    icon: HiCodeBracket,
    label: 'API Reference',
    url: 'https://docs.genfeed.ai/api',
  },
  {
    icon: SiSubstack,
    label: 'Substack',
    url: EnvironmentService.social.substack,
  },
];

const COMMUNITY: LinkItem[] = [
  {
    icon: FaDiscord,
    label: 'Discord',
    url: EnvironmentService.social.discord,
  },
  {
    icon: FaXTwitter,
    label: 'X (Twitter)',
    url: EnvironmentService.social.twitter,
  },
  {
    icon: FaInstagram,
    label: 'Instagram',
    url: EnvironmentService.social.instagram,
  },
  {
    icon: FaTiktok,
    label: 'TikTok',
    url: EnvironmentService.social.tiktok,
  },
  {
    icon: FaLinkedin,
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
        <HiArrowTopRightOnSquare className="size-4 shrink-0 text-muted-foreground" />
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
