'use client';

import {
  ButtonVariant,
  CampaignPlatform,
  CampaignType,
} from '@genfeedai/contracts';
import {
  evaluateOutreachCapability,
  isOutreachPairExecutable,
} from '@genfeedai/contracts/api-types/contracts/outreach-capabilities.contract';
import {
  InstagramIcon,
  RedditIcon,
  XTwitterIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId } from 'react';

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
  const translate = useTranslations('pages.outreachCampaign');

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium">Platform</p>
        <div className="grid grid-cols-2 gap-4">
          {platformOptions.map((option) => (
            <OutreachCapabilityOption
              key={option.value}
              campaignType={campaignType}
              icon={option.icon}
              isSelected={platform === option.value}
              label={option.label}
              platform={option.value}
              onSelect={() => onPlatformChange(option.value)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">{translate('sequenceType')}</p>
        <div className="space-y-3">
          {typeOptions.map((option) => (
            <OutreachCapabilityOption
              key={option.value}
              campaignType={option.value}
              description={option.description}
              isSelected={campaignType === option.value}
              label={option.label}
              layout="stack"
              platform={platform}
              onSelect={() => onTypeChange(option.value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function OutreachCapabilityOption({
  campaignType,
  description,
  icon,
  isSelected,
  label,
  layout = 'row',
  onSelect,
  platform,
}: {
  campaignType: CampaignType;
  description?: string;
  icon?: ReactNode;
  isSelected: boolean;
  label: string;
  layout?: 'row' | 'stack';
  onSelect: () => void;
  platform: CampaignPlatform;
}) {
  const reasonId = useId();
  const evaluation = evaluateOutreachCapability({
    campaignType,
    platform,
  });
  const isUnavailable = !isOutreachPairExecutable(evaluation);
  const reason = isUnavailable ? evaluation.ui.body : undefined;

  return (
    <Button
      aria-describedby={isUnavailable ? reasonId : undefined}
      aria-disabled={isUnavailable || undefined}
      aria-pressed={isSelected}
      className={`flex items-start gap-3 border p-4 transition-colors ${
        layout === 'stack' ? 'w-full flex-col' : 'items-center'
      } ${
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50'
      } ${isUnavailable ? 'cursor-not-allowed opacity-50' : ''}`}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      onClick={() => {
        if (isUnavailable) {
          return;
        }
        onSelect();
      }}
    >
      {icon ? <span className="text-2xl">{icon}</span> : null}
      <span className="font-medium">{label}</span>
      {reason || description ? (
        <span
          className="text-sm text-foreground/60"
          id={isUnavailable ? reasonId : undefined}
        >
          {reason ?? description}
        </span>
      ) : null}
    </Button>
  );
}
