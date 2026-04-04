'use client';

import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
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

function LinkCard({ item }: { item: LinkItem }) {
  const Icon = item.icon;
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg border border-border p-4 no-underline text-foreground transition-colors hover:bg-muted/50"
    >
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-sm font-medium">{item.label}</span>
      <HiArrowTopRightOnSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

export default function SettingsHelpPage() {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Resources</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RESOURCES.map((item) => (
            <LinkCard key={item.label} item={item} />
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Community</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COMMUNITY.map((item) => (
            <LinkCard key={item.label} item={item} />
          ))}
        </div>
      </Card>
    </div>
  );
}
