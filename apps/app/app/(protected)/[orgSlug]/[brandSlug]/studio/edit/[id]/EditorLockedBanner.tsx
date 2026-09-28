import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { EditorLockedBannerProps } from '@props/studio/editor-locked-banner.props';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Lock } from 'lucide-react';

export default function EditorLockedBanner({
  hasSaveConflict,
  isDuplicating,
  onDuplicate,
}: EditorLockedBannerProps) {
  return (
    <Alert variant="info" className="rounded-none border-x-0 border-t-0">
      <Lock aria-hidden="true" />
      <AlertTitle>This project is read-only</AlertTitle>
      <AlertDescription>
        <p>
          {hasSaveConflict
            ? 'It was generated from an approved composition template, so your recent changes were not saved.'
            : 'It was generated from an approved composition template, so it cannot be changed.'}{' '}
          Duplicate it to edit a copy.
        </p>
        <div className="mt-3 flex">
          <Button
            withWrapper={false}
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={onDuplicate}
            isLoading={isDuplicating}
          >
            Duplicate to edit
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
