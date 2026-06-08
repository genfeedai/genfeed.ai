'use client';

import type {
  CampaignPlatform,
  CampaignType,
  ReplyTone,
} from '@genfeedai/enums';
import Badge from '@ui/display/badge/Badge';

interface OutreachCampaignWizardStep5Props {
  campaignType: CampaignType;
  description: string;
  label: string;
  maxPerDay: number;
  maxPerHour: number;
  platform: CampaignPlatform;
  tone: ReplyTone;
}

export default function OutreachCampaignWizardStep5({
  campaignType,
  description,
  label,
  maxPerDay,
  maxPerHour,
  platform,
  tone,
}: OutreachCampaignWizardStep5Props) {
  return (
    <div className="space-y-6">
      <div className=" border border-white/[0.08] p-4">
        <h3 className="mb-4 font-semibold">Review Your Campaign</h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-foreground/60">Name:</span>
            <span className="ml-2 font-medium">{label}</span>
          </div>
          <div>
            <span className="text-foreground/60">Platform:</span>
            <Badge variant="secondary" className="ml-2">
              {platform}
            </Badge>
          </div>
          <div>
            <span className="text-foreground/60">Type:</span>
            <Badge variant="secondary" className="ml-2">
              {campaignType}
            </Badge>
          </div>
          <div>
            <span className="text-foreground/60">Tone:</span>
            <span className="ml-2">{tone}</span>
          </div>
          <div>
            <span className="text-foreground/60">Max/Hour:</span>
            <span className="ml-2">{maxPerHour}</span>
          </div>
          <div>
            <span className="text-foreground/60">Max/Day:</span>
            <span className="ml-2">{maxPerDay}</span>
          </div>
        </div>

        {description && (
          <div className="mt-4">
            <span className="text-foreground/60">Description:</span>
            <p className="mt-1 text-sm">{description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
