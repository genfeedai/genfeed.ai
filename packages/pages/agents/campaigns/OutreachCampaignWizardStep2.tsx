'use client';

import { CampaignPlatform, CampaignType } from '@genfeedai/enums';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

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
  onSubredditsChange: (value: string) => void;
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
  onSubredditsChange,
}: OutreachCampaignWizardStep2Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <label
          htmlFor="campaign-wizard-name"
          className="text-sm font-medium text-foreground"
        >
          Campaign Name
        </label>
        <Input
          id="campaign-wizard-name"
          placeholder="e.g., Product Launch Q1"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          required
        />
      </div>

      <Textarea
        label="Description"
        placeholder="Brief description of the campaign goals"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        rows={3}
      />

      <div className="space-y-1.5">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="campaign-wizard-credential"
        >
          Credential
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

      {campaignType === CampaignType.DISCOVERY && (
        <>
          <div className="space-y-1.5">
            <label
              htmlFor="campaign-wizard-keywords"
              className="text-sm font-medium text-foreground"
            >
              Keywords (comma-separated)
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
              Hashtags (comma-separated)
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
                Subreddits (comma-separated)
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
