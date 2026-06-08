'use client';

import {
  ButtonVariant,
  CampaignPlatform,
  CampaignType,
} from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { FaInstagram, FaReddit, FaXTwitter } from 'react-icons/fa6';

const platformOptions = [
  {
    icon: <FaXTwitter />,
    label: 'Twitter / X',
    value: CampaignPlatform.TWITTER,
  },
  {
    icon: <FaReddit />,
    label: 'Reddit',
    value: CampaignPlatform.REDDIT,
  },
  {
    icon: <FaInstagram className="text-pink-500" />,
    label: 'Instagram',
    value: CampaignPlatform.INSTAGRAM,
  },
];

const typeOptions = [
  {
    description: 'Add specific URLs to target',
    label: 'Manual',
    value: CampaignType.MANUAL,
  },
  {
    description: 'AI discovers relevant content',
    label: 'Discovery',
    value: CampaignType.DISCOVERY,
  },
  {
    description: 'Schedule replies in advance',
    label: 'Scheduled Blast',
    value: CampaignType.SCHEDULED_BLAST,
  },
  {
    description: 'Send cold DMs to target users',
    label: 'DM Outreach',
    value: CampaignType.DM_OUTREACH,
  },
];

type Props = {
  platform: CampaignPlatform;
  campaignType: CampaignType;
  onPlatformChange: (value: CampaignPlatform) => void;
  onTypeChange: (value: CampaignType) => void;
};

export default function OutreachCampaignWizardStep1({
  platform,
  campaignType,
  onPlatformChange,
  onTypeChange,
}: Props) {
  return (
    <div className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium">Platform</label>
        <div className="grid grid-cols-2 gap-4">
          {platformOptions.map((option) => (
            <Button
              key={option.value}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => onPlatformChange(option.value)}
              className={`flex items-center gap-3 border p-4 transition-colors ${
                platform === option.value
                  ? 'border-primary bg-primary/10'
                  : 'border-white/[0.08] hover:border-primary/50'
              }`}
            >
              <span className="text-2xl">{option.icon}</span>
              <span className="font-medium">{option.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Campaign Type</label>
        <div className="space-y-3">
          {typeOptions.map((option) => (
            <Button
              key={option.value}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => onTypeChange(option.value)}
              className={`flex w-full flex-col items-start border p-4 transition-colors ${
                campaignType === option.value
                  ? 'border-primary bg-primary/10'
                  : 'border-white/[0.08] hover:border-primary/50'
              }`}
            >
              <span className="font-medium">{option.label}</span>
              <span className="text-sm text-foreground/60">
                {option.description}
              </span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
