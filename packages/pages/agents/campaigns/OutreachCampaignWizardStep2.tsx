'use client';

import { CampaignPlatform, CampaignType } from '@genfeedai/contracts';
import {
  fromDateTimeLocalInput,
  TIMEZONES,
  toDateTimeLocalInput,
} from '@helpers/formatting/timezone/timezone.helper';
import DateTimePicker from '@ui/primitives/date-time-picker';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';

interface Credential {
  id: string;
  externalHandle: string;
  platform: string;
}

interface OutreachCampaignWizardStep2Props {
  campaignType: CampaignType;
  credential: string;
  description: string;
  filteredCredentials: Credential[];
  hashtags: string;
  keywords: string;
  label: string;
  platform: CampaignPlatform;
  subreddits: string;
  onCredentialChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onHashtagsChange: (value: string) => void;
  onKeywordsChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onScheduledLocalDateTimeChange: (value: string) => void;
  onSubredditsChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  scheduledLocalDateTime: string;
  timezone: string;
}

export default function OutreachCampaignWizardStep2({
  campaignType,
  credential,
  description,
  filteredCredentials,
  hashtags,
  keywords,
  label,
  platform,
  subreddits,
  onCredentialChange,
  onDescriptionChange,
  onHashtagsChange,
  onKeywordsChange,
  onLabelChange,
  onScheduledLocalDateTimeChange,
  onSubredditsChange,
  onTimezoneChange,
  scheduledLocalDateTime,
  timezone,
}: OutreachCampaignWizardStep2Props) {
  const translate = useTranslations('common.outreachCampaign');
  const timezoneOptions = TIMEZONES.some((zone) => zone.value === timezone)
    ? TIMEZONES
    : [{ label: timezone, offset: 0, value: timezone }, ...TIMEZONES];

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <label
          htmlFor="campaign-wizard-name"
          className="text-sm font-medium text-foreground"
        >
          {translate('campaignName')}
        </label>
        <Input
          id="campaign-wizard-name"
          placeholder="e.g., Product Launch Q1"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="campaign-wizard-description"
          className="text-sm font-medium text-foreground"
        >
          {translate('description')}
        </Label>
        <Textarea
          id="campaign-wizard-description"
          placeholder={translate('descriptionPlaceholder')}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="campaign-wizard-credential"
        >
          {translate('credential')}
        </label>
        <Select value={credential} onValueChange={onCredentialChange} required>
          <SelectTrigger id="campaign-wizard-credential">
            <SelectValue placeholder="Select a credential" />
          </SelectTrigger>
          <SelectContent>
            {filteredCredentials.map((cred) => (
              <SelectItem key={cred.id} value={cred.id}>
                @{cred.externalHandle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {campaignType === CampaignType.SCHEDULED_BLAST && (
        <>
          <div className="space-y-1.5">
            <DateTimePicker
              helpText={translate('scheduleHelp')}
              isRequired
              label={translate('deliveryTime')}
              minDate={new Date()}
              timezone={timezone}
              value={
                fromDateTimeLocalInput(scheduledLocalDateTime, timezone) ??
                undefined
              }
              onChange={(date) =>
                onScheduledLocalDateTimeChange(
                  date ? toDateTimeLocalInput(date, timezone) : '',
                )
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label
              className="text-sm font-medium text-foreground"
              htmlFor="campaign-wizard-timezone"
            >
              {translate('timezone')}
            </Label>
            <Select required value={timezone} onValueChange={onTimezoneChange}>
              <SelectTrigger id="campaign-wizard-timezone">
                <SelectValue placeholder={translate('timezone')} />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions.map((zone) => (
                  <SelectItem key={zone.value} value={zone.value}>
                    {zone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {campaignType === CampaignType.DISCOVERY && (
        <>
          <div className="space-y-1.5">
            <label
              htmlFor="campaign-wizard-keywords"
              className="text-sm font-medium text-foreground"
            >
              {translate('keywords')}
            </label>
            <Input
              id="campaign-wizard-keywords"
              placeholder="startup, saas, tech"
              value={keywords}
              onChange={(e) => onKeywordsChange(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="campaign-wizard-hashtags"
              className="text-sm font-medium text-foreground"
            >
              {translate('hashtags')}
            </label>
            <Input
              id="campaign-wizard-hashtags"
              placeholder="buildinpublic, startup"
              value={hashtags}
              onChange={(e) => onHashtagsChange(e.target.value)}
            />
          </div>

          {platform === CampaignPlatform.REDDIT && (
            <div className="space-y-1.5">
              <label
                htmlFor="campaign-wizard-subreddits"
                className="text-sm font-medium text-foreground"
              >
                {translate('subreddits')}
              </label>
              <Input
                id="campaign-wizard-subreddits"
                placeholder="entrepreneur, startups"
                value={subreddits}
                onChange={(e) => onSubredditsChange(e.target.value)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
