'use client';

import {
  type CampaignPlatform,
  CampaignType,
  type ReplyTone,
} from '@genfeedai/contracts';
import Badge from '@ui/display/badge/Badge';
import { useTranslations } from 'next-intl';

interface OutreachCampaignWizardStep5Props {
  campaignType: CampaignType;
  description: string;
  label: string;
  maxPerDay: number;
  maxPerHour: number;
  platform: CampaignPlatform;
  scheduledLocalDateTime: string;
  timezone: string;
  tone: ReplyTone;
}

export default function OutreachCampaignWizardStep5({
  campaignType,
  description,
  label,
  maxPerDay,
  maxPerHour,
  platform,
  scheduledLocalDateTime,
  timezone,
  tone,
}: OutreachCampaignWizardStep5Props) {
  const translate = useTranslations('pages.outreachCampaign');

  return (
    <div className="space-y-6">
      <div className="bg-card p-4 shadow-border">
        <h3 className="mb-4 font-semibold">{translate('reviewTitle')}</h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-foreground/60">{translate('name')}</span>
            <span className="ml-2 font-medium">{label}</span>
          </div>
          <div>
            <span className="text-foreground/60">{translate('platform')}</span>
            <Badge variant="secondary" className="ml-2">
              {platform}
            </Badge>
          </div>
          <div>
            <span className="text-foreground/60">{translate('type')}</span>
            <Badge variant="secondary" className="ml-2">
              {campaignType}
            </Badge>
          </div>
          <div>
            <span className="text-foreground/60">{translate('tone')}</span>
            <span className="ml-2">{tone}</span>
          </div>
          <div>
            <span className="text-foreground/60">
              {translate('maxPerHour')}
            </span>
            <span className="ml-2">{maxPerHour}</span>
          </div>
          <div>
            <span className="text-foreground/60">{translate('maxPerDay')}</span>
            <span className="ml-2">{maxPerDay}</span>
          </div>
          {campaignType === CampaignType.SCHEDULED_BLAST ? (
            <>
              <div>
                <span className="text-foreground/60">
                  {translate('deliveryTime')}
                </span>
                <span className="ml-2">{scheduledLocalDateTime}</span>
              </div>
              <div>
                <span className="text-foreground/60">
                  {translate('timezone')}
                </span>
                <span className="ml-2">{timezone}</span>
              </div>
            </>
          ) : null}
        </div>

        {description && (
          <div className="mt-4">
            <span className="text-foreground/60">
              {translate('description')}
            </span>
            <p className="mt-1 text-sm">{description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
