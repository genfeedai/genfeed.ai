'use client';

import { ButtonSize, ButtonVariant, type Platform } from '@genfeedai/contracts';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { Button } from '@ui/primitives/button';
import { ExternalLink } from 'lucide-react';

type Props = {
  url: string;
  platform: Platform;
};

export default function ActivityLinkCell({ url, platform }: Props) {
  return (
    <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.XS}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {getPlatformIcon(platform, 'size-4')}
        <ExternalLink className="size-3" />
      </a>
    </Button>
  );
}
