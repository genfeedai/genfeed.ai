'use client';

import {
  ButtonSize,
  ButtonVariant,
  CampaignPlatform,
  CampaignStatus,
} from '@genfeedai/enums';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { FaInstagram, FaReddit, FaXTwitter } from 'react-icons/fa6';
import { HiArrowLeft } from 'react-icons/hi2';

const platformIcons: Record<CampaignPlatform, React.ReactNode> = {
  [CampaignPlatform.TWITTER]: <FaXTwitter className="text-slate-300" />,
  [CampaignPlatform.REDDIT]: <FaReddit className="text-orange-500" />,
  [CampaignPlatform.INSTAGRAM]: <FaInstagram className="text-pink-500" />,
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
        label={<HiArrowLeft />}
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
