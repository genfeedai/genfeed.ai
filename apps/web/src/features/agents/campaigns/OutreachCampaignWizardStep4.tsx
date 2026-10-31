'use client';

import { CampaignType } from '@genfeedai/contracts';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';

type Props = {
  campaignType: CampaignType;
  maxPerHour: number;
  maxPerDay: number;
  delayBetweenRepliesSeconds: number;
  onMaxPerHourChange: (value: number) => void;
  onMaxPerDayChange: (value: number) => void;
  onDelayBetweenRepliesSecondsChange: (value: number) => void;
};

export default function OutreachCampaignWizardStep4({
  campaignType,
  maxPerHour,
  maxPerDay,
  delayBetweenRepliesSeconds,
  onMaxPerHourChange,
  onMaxPerDayChange,
  onDelayBetweenRepliesSecondsChange,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label
          htmlFor="campaign-wizard-max-per-hour"
          className="text-foreground"
        >
          Max Replies per Hour
        </Label>
        <Input
          id="campaign-wizard-max-per-hour"
          type="number"
          min={1}
          max={50}
          value={maxPerHour}
          onChange={(e) =>
            onMaxPerHourChange(parseInt(e.target.value, 10) || 10)
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="campaign-wizard-max-per-day"
          className="text-foreground"
        >
          Max Replies per Day
        </Label>
        <Input
          id="campaign-wizard-max-per-day"
          type="number"
          min={1}
          max={200}
          value={maxPerDay}
          onChange={(e) =>
            onMaxPerDayChange(parseInt(e.target.value, 10) || 50)
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="campaign-wizard-delay-between-replies"
          className="text-foreground"
        >
          Delay Between Replies (seconds)
        </Label>
        <Input
          id="campaign-wizard-delay-between-replies"
          type="number"
          min={30}
          value={delayBetweenRepliesSeconds}
          onChange={(e) =>
            onDelayBetweenRepliesSecondsChange(
              parseInt(e.target.value, 10) || 60,
            )
          }
        />
      </div>

      {campaignType === CampaignType.DM_OUTREACH && (
        <p className="text-sm text-foreground/60">
          Recommended DM limits: 5/hour, 20/day, 120s delay to avoid account
          restrictions.
        </p>
      )}
    </div>
  );
}
