import { cn } from '@genfeedai/helpers';
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import type {
  AgentPresetAvatarProps,
  PlatformBrand,
} from '@props/automation/agent-preset-avatar.props';
import type { ReactNode } from 'react';
import { getAgentTypeIcon } from '../agents/agent-type-display';

const PLATFORM_BRANDS: Record<string, PlatformBrand> = {
  facebook: { faceClassName: 'bg-blue-600', Icon: FacebookIcon },
  instagram: { faceClassName: 'bg-pink-500', Icon: InstagramIcon },
  linkedin: { faceClassName: 'bg-blue-700', Icon: LinkedinIcon },
  tiktok: {
    faceClassName: 'bg-zinc-900 ring-1 ring-inset ring-white/15',
    Icon: TiktokIcon,
  },
  twitter: {
    faceClassName: 'bg-zinc-900 ring-1 ring-inset ring-white/15',
    Icon: XTwitterIcon,
  },
  youtube: { faceClassName: 'bg-red-500', Icon: YoutubeIcon },
};

const PLATFORM_ALIASES: Record<string, string> = { x: 'twitter' };

// Eyes are the only per-role variation, so every agent reads as one family.
const EYE_STYLES: ReactNode[] = [
  <g key="pill">
    <rect x="18.5" y="22" width="5.5" height="16" rx="2.75" />
    <rect x="40" y="22" width="5.5" height="16" rx="2.75" />
  </g>,
  <path
    key="chevron"
    d="M17 24l8 6-8 6M47 24l-8 6 8 6"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="3.2"
  />,
  <g key="ring" fill="none" stroke="currentColor" strokeWidth="3.2">
    <circle cx="21" cy="30" r="4.2" />
    <circle cx="43" cy="30" r="4.2" />
  </g>,
  <g key="wink">
    <circle cx="21" cy="30" r="3.6" />
    <path
      d="M38 30h10"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="3.2"
    />
  </g>,
  <path
    key="caret"
    d="M15 34l6-9 6 9M37 34l6-9 6 9"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="3.2"
  />,
  <path
    key="plus"
    d="M21 24v12M15 30h12M43 24v12M37 30h12"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="3.2"
  />,
  <g key="tilt">
    <rect
      x="18.5"
      y="22"
      width="5.5"
      height="16"
      rx="2.75"
      transform="rotate(14 21 30)"
    />
    <rect
      x="40"
      y="22"
      width="5.5"
      height="16"
      rx="2.75"
      transform="rotate(14 43 30)"
    />
  </g>,
  <g key="dots">
    <circle cx="21" cy="30" r="3.6" />
    <circle cx="43" cy="30" r="3.6" />
  </g>,
];

function pickEyes(seed: string): ReactNode {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return EYE_STYLES[hash % EYE_STYLES.length];
}

function resolveBrand(platforms: string[]): PlatformBrand | null {
  const keys = new Set(
    platforms.map((platform) => {
      const key = platform.trim().toLowerCase();
      return PLATFORM_ALIASES[key] ?? key;
    }),
  );
  if (keys.size !== 1) {
    return null;
  }
  return PLATFORM_BRANDS[[...keys][0]] ?? null;
}

/**
 * A single-platform agent takes that platform's color and logo; every other
 * agent gets the neutral face with its role icon in the corner dot.
 */
export default function AgentPresetAvatar({
  className,
  platforms,
  presetId,
  type,
}: AgentPresetAvatarProps) {
  const brand = resolveBrand(platforms);
  const RoleIcon = getAgentTypeIcon(type);
  const CornerIcon = brand?.Icon ?? RoleIcon;

  return (
    <span
      className={cn('relative inline-flex size-10 shrink-0', className)}
      data-testid={`agent-avatar-${presetId}`}
    >
      <svg
        aria-hidden="true"
        className={cn(
          'size-full rounded-full fill-current',
          brand
            ? cn(brand.faceClassName, 'text-white') // design-system-allow-content-color
            : 'bg-foreground text-background',
        )}
        viewBox="0 0 64 64"
      >
        {pickEyes(presetId)}
      </svg>
      <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-foreground text-background ring-2 ring-background">
        <CornerIcon className="size-2.5" />
      </span>
    </span>
  );
}
