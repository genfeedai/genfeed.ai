import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { EditorLockedBannerProps } from '@props/studio/editor-locked-banner.props';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function EditorLockedBanner({
  hasSaveConflict,
  isDuplicating,
  onDuplicate,
}: EditorLockedBannerProps) {
  const t = useTranslations('pages.studioEditorLock');

  return (
    <Alert variant="info" className="rounded-none border-x-0 border-t-0">
      <Lock aria-hidden="true" />
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription>
        <p>{hasSaveConflict ? t('conflictDescription') : t('description')}</p>
        <div className="mt-3 flex">
          <Button
            withWrapper={false}
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={onDuplicate}
            isLoading={isDuplicating}
          >
            {t('duplicateToEdit')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
