import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { EditorLockedBannerProps } from '@/features/studio/props/editor-locked-banner.props';

export default function EditorLockedBanner({
  hasSaveConflict,
  isDuplicating,
  onDuplicate,
}: EditorLockedBannerProps) {
  const t = useTranslations('pages.studioEditorLock');

  return (
    <Alert
      variant="info"
      className="rounded-none border-x-0 border-t-0"
      icon={<Lock aria-hidden="true" className="size-4" />}
    >
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
