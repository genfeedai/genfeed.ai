'use client';

import { ButtonSize, ButtonVariant, type Platform } from '@genfeedai/enums';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { Button } from '@ui/primitives/button';
import { HiArrowTopRightOnSquare } from 'react-icons/hi2';

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
        <HiArrowTopRightOnSquare className="size-3" />
      </a>
    </Button>
  );
}
