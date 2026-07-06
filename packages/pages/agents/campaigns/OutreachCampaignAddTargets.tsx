'use client';

import { ButtonVariant, CampaignType } from '@genfeedai/enums';
import Textarea from '@ui/inputs/textarea/Textarea';
import { Button } from '@ui/primitives/button';
import { HiPlus } from 'react-icons/hi2';

type Props = {
  campaignType: CampaignType;
  urlInput: string;
  isAddingUrls: boolean;
  onUrlInputChange: (value: string) => void;
  onAddUrls: () => void;
  onAddDmRecipients: () => void;
};

export default function OutreachCampaignAddTargets({
  campaignType,
  urlInput,
  isAddingUrls,
  onUrlInputChange,
  onAddUrls,
  onAddDmRecipients,
}: Props) {
  if (campaignType === CampaignType.DM_OUTREACH) {
    return (
      <div className="bg-card p-4 shadow-border">
        <h3 className="mb-4 text-lg font-semibold">Add DM Recipients</h3>
        <Textarea
          placeholder="Paste usernames (one per line)&#10;@johndoe&#10;janedoe&#10;@creator123"
          value={urlInput}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            onUrlInputChange(e.target.value)
          }
          rows={4}
        />
        <div className="mt-4 flex justify-end">
          <Button
            label={
              <>
                <HiPlus /> Add Recipients
              </>
            }
            variant={ButtonVariant.DEFAULT}
            onClick={onAddDmRecipients}
            isDisabled={!urlInput.trim() || isAddingUrls}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card p-4 shadow-border">
      <h3 className="mb-4 text-lg font-semibold">Add Target URLs</h3>
      <Textarea
        placeholder="Paste tweet or Reddit URLs (one per line)&#10;https://twitter.com/user/status/123456789&#10;https://reddit.com/r/subreddit/comments/abc123/title"
        value={urlInput}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          onUrlInputChange(e.target.value)
        }
        rows={4}
      />
      <div className="mt-4 flex justify-end">
        <Button
          label={
            <>
              <HiPlus /> Add Targets
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={onAddUrls}
          isDisabled={!urlInput.trim() || isAddingUrls}
        />
      </div>
    </div>
  );
}
