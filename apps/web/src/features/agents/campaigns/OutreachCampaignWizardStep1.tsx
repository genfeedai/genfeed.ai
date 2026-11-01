'use client';

import { CampaignPlatform, CampaignType } from '@genfeedai/contracts';
import {
  evaluateOutreachCapability,
  isOutreachPairExecutable,
} from '@genfeedai/contracts/api-types/contracts/outreach-capabilities.contract';
import {
  InstagramIcon,
  RedditIcon,
  XTwitterIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

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
  const selectionLabels = useTranslations('ui.selectionGroups');
  const translate = useTranslations('pages.outreachCampaign');

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-medium">Platform</p>
        <OptionTileGroup
          ariaLabel={selectionLabels('platform')}
          columns={2}
          onValueChange={onPlatformChange}
          value={platform}
        >
          {platformOptions.map((option) => (
            <OutreachCapabilityOption
              campaignType={campaignType}
              icon={option.icon}
              key={option.value}
              label={option.label}
              platform={option.value}
              value={option.value}
            />
          ))}
        </OptionTileGroup>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">{translate('sequenceType')}</p>
        <OptionTileGroup
          ariaLabel={translate('sequenceType')}
          columns={1}
          onValueChange={onTypeChange}
          value={campaignType}
        >
          {typeOptions.map((option) => (
            <OutreachCapabilityOption
              campaignType={option.value}
              description={option.description}
              key={option.value}
              label={option.label}
              layout="stack"
              platform={platform}
              value={option.value}
            />
          ))}
        </OptionTileGroup>
      </div>
    </div>
  );
}

function OutreachCapabilityOption({
  campaignType,
  description,
  icon,
  label,
  layout = 'row',
  platform,
  value,
}: {
  campaignType: CampaignType;
  description?: string;
  icon?: ReactNode;
  label: string;
  layout?: 'row' | 'stack';
  platform: CampaignPlatform;
  value: string;
}) {
  const evaluation = evaluateOutreachCapability({ campaignType, platform });
  const isUnavailable = !isOutreachPairExecutable(evaluation);
  const reason = isUnavailable ? evaluation.ui.body : undefined;

  return (
    <OptionTile
      description={reason ?? description}
      icon={icon ? <span className="text-2xl">{icon}</span> : undefined}
      isUnavailable={isUnavailable}
      layout={layout}
      title={label}
      value={value}
    />
  );
}
