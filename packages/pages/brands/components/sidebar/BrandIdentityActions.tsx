'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';

type BrandIdentityActionsProps = {
  isSavingIdentity: boolean;
  isUsingOrgFallback: boolean;
  currentAvatarSummary: string;
  currentVoiceSummary: string;
  onSave: () => void;
  onBrowseAvatars: () => void;
  onBrowseVoices: () => void;
};

export default function BrandIdentityActions({
  isSavingIdentity,
  isUsingOrgFallback,
  currentAvatarSummary,
  currentVoiceSummary,
  onSave,
  onBrowseAvatars,
  onBrowseVoices,
}: BrandIdentityActionsProps) {
  return (
    <>
      {isUsingOrgFallback ? (
        <p className="text-xs text-muted-foreground">
          This brand is currently using organization identity defaults.
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Current avatar: {currentAvatarSummary}. Current voice:{' '}
        {currentVoiceSummary}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          data-testid="save-brand-identity"
          onClick={onSave}
          isDisabled={isSavingIdentity}
          withWrapper={false}
        >
          {isSavingIdentity ? 'Saving...' : 'Save Brand Identity'}
        </Button>
        <Button
          data-testid="brand-browse-avatar-library"
          onClick={onBrowseAvatars}
          type="button"
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          Browse Avatar Library
        </Button>
        <Button
          onClick={onBrowseVoices}
          type="button"
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          Browse Voice Library
        </Button>
      </div>
    </>
  );
}
