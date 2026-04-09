'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { ICredential } from '@genfeedai/interfaces';
import type { ComponentType, ReactElement } from 'react';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaStar,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import { cn } from '../lib/utils';
import { Button } from './button';

type IconComponent = ComponentType<{ className?: string }>;

interface PlatformIconConfig {
  Icon: IconComponent;
  colorClass: string;
}

const PLATFORM_ICONS: Record<string, PlatformIconConfig> = {
  facebook: {
    colorClass: 'text-blue-600',
    Icon: FaFacebook,
  },
  fanvue: {
    colorClass: 'text-violet-500',
    Icon: FaStar,
  },
  instagram: {
    colorClass: 'text-pink-500',
    Icon: FaInstagram,
  },
  linkedin: {
    colorClass: 'text-blue-700',
    Icon: FaLinkedin,
  },
  tiktok: {
    colorClass: 'text-foreground',
    Icon: FaTiktok,
  },
  twitter: {
    colorClass: 'text-foreground',
    Icon: FaXTwitter,
  },
  x: {
    colorClass: 'text-foreground',
    Icon: FaXTwitter,
  },
  youtube: {
    colorClass: 'text-red-500',
    Icon: FaYoutube,
  },
};

function getPlatformIcon(
  platform: string,
  className: string = 'w-4 h-4',
): ReactElement | null {
  const config = PLATFORM_ICONS[platform?.toLowerCase()];
  if (!config) {
    return null;
  }

  const { Icon, colorClass } = config;
  return <Icon className={`${className} ${colorClass}`} />;
}

export interface PlatformSelectorProps {
  credentials: ICredential[];
  selectedCredentialId: string;
  onSelect: (credentialId: string) => void;
  isDisabled?: boolean;
  className?: string;
}

export default function PlatformSelector({
  credentials,
  selectedCredentialId,
  onSelect,
  isDisabled = false,
  className = '',
}: PlatformSelectorProps) {
  if (!credentials || credentials.length === 0) {
    return (
      <div className="text-center py-4 text-foreground/60 text-sm">
        No platform accounts available
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-wrap gap-2',
        isDisabled && 'opacity-50 pointer-events-none',
        className,
      )}
      role="radiogroup"
      aria-label="Select platform account"
    >
      {credentials.map((credential) => {
        const isSelected = credential.id === selectedCredentialId;
        const platformIcon = getPlatformIcon(credential.platform, 'w-4 h-4');
        const displayLabel = credential.label || credential.externalHandle;

        return (
          <Button
            key={credential.id}
            type="button"
            onClick={() => onSelect(credential.id)}
            isDisabled={isDisabled}
            variant={ButtonVariant.UNSTYLED}
            className={cn(
              'flex items-center gap-2 px-3 py-2 border border-white/[0.08] transition-all min-w-0',
              'hover:bg-background/50 focus:outline-none focus:ring-1 focus:ring-primary gap-2',
              isSelected ? 'bg-foreground/10 border-foreground/20' : 'bg-card',
              !isDisabled && 'cursor-pointer',
            )}
          >
            <div className="flex-shrink-0">{platformIcon}</div>
            {displayLabel && (
              <div className="text-sm text-foreground/70 truncate max-w-32">
                {displayLabel}
              </div>
            )}
          </Button>
        );
      })}
    </div>
  );
}
