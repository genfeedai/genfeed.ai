'use client';

import {
  ButtonSize,
  ButtonVariant,
  CampaignPlatform,
  CampaignStatus,
} from '@genfeedai/contracts';
import {
  InstagramIcon,
  RedditIcon,
  XTwitterIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { ArrowLeft } from 'lucide-react';

const platformIcons: Record<CampaignPlatform, React.ReactNode> = {
  [CampaignPlatform.TWITTER]: <XTwitterIcon className="text-foreground/70" />,
  [CampaignPlatform.REDDIT]: <RedditIcon className="text-orange-500" />,
  [CampaignPlatform.INSTAGRAM]: <InstagramIcon className="text-pink-500" />,
};

function getCampaignStatusVariant(
  status: CampaignStatus,
): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (status) {
    case CampaignStatus.ACTIVE:
      return 'success';
    case CampaignStatus.PAUSED:
      return 'warning';
    case CampaignStatus.COMPLETED:
      return 'destructive';
    default:
      return 'secondary';
  }
}

type Props = {
  platform: CampaignPlatform;
  status: CampaignStatus;
  onBack: () => void;
};

export default function OutreachCampaignDetailHeader({
  platform,
  status,
  onBack,
}: Props) {
  return (
    <div className="flex items-center gap-4">
      <Button
        label={<ArrowLeft />}
        variant={ButtonVariant.SECONDARY}
        onClick={onBack}
        size={ButtonSize.SM}
      />
      <div className="flex items-center gap-2">
        {platformIcons[platform]}
        <Badge variant={getCampaignStatusVariant(status)}>{status}</Badge>
      </div>
    </div>
  );
}
