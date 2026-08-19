'use client';

import {
  ButtonVariant,
  CampaignPlatform,
  CampaignType,
} from '@genfeedai/enums';
import {
  InstagramIcon,
  RedditIcon,
  XTwitterIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { Button } from '@ui/primitives/button';

const platformOptions = [
  {
    icon: <XTwitterIcon />,
    label: 'Twitter / X',
    value: CampaignPlatform.TWITTER,
  },
  {
    icon: <RedditIcon />,
    label: 'Reddit',
    value: CampaignPlatform.REDDIT,
  },
  {
    icon: <InstagramIcon className="text-pink-500" />,
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
        <p className="mb-2 text-sm font-medium">Platform</p>
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
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <span className="text-2xl">{option.icon}</span>
              <span className="font-medium">{option.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Campaign Type</p>
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
                  : 'border-border hover:border-primary/50'
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
