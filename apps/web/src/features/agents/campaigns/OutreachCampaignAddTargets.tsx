'use client';

import { ButtonVariant, CampaignType } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { Plus } from 'lucide-react';

type Props = {
  campaignType: CampaignType;
  isUnavailable?: boolean;
  urlInput: string;
  isAddingUrls: boolean;
  unavailableReason?: string;
  onUrlInputChange: (value: string) => void;
  onAddUrls: () => void;
  onAddDmRecipients: () => void;
};

export default function OutreachCampaignAddTargets({
  campaignType,
  isUnavailable = false,
  urlInput,
  isAddingUrls,
  unavailableReason,
  onUrlInputChange,
  onAddUrls,
  onAddDmRecipients,
}: Props) {
  const isDm = campaignType === CampaignType.DM_OUTREACH;
  const reasonId = 'outreach-add-targets-unavailable';

  return (
    <div className="bg-card p-4 shadow-border">
      <h3 className="mb-4 text-lg font-semibold">
        {isDm ? 'Add DM Recipients' : 'Add Target URLs'}
      </h3>
      {isUnavailable && unavailableReason ? (
        <p className="mb-4 text-sm text-foreground/70" id={reasonId}>
          {unavailableReason}
        </p>
      ) : null}
      <Textarea
        aria-disabled={isUnavailable || undefined}
        isReadOnly={isUnavailable}
        placeholder={
          isDm
            ? 'Paste usernames (one per line)&#10;@johndoe&#10;janedoe&#10;@creator123'
            : 'Paste X post URLs (one per line)&#10;https://x.com/user/status/123456789'
        }
        value={urlInput}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
          if (isUnavailable) {
            return;
          }
          onUrlInputChange(e.target.value);
        }}
        rows={4}
      />
      <div className="mt-4 flex justify-end">
        <Button
          aria-describedby={isUnavailable ? reasonId : undefined}
          aria-disabled={isUnavailable || undefined}
          label={
            <>
              <Plus /> {isDm ? 'Add Recipients' : 'Add Targets'}
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={() => {
            if (isUnavailable) {
              return;
            }
            if (isDm) {
              onAddDmRecipients();
              return;
            }
            onAddUrls();
          }}
          isDisabled={!isUnavailable && (!urlInput.trim() || isAddingUrls)}
        />
      </div>
    </div>
  );
}
