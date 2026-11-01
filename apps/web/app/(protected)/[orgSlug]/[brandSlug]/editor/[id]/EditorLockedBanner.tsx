import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
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
    <div className="px-4 pt-3">
      <Alert
        variant="info"
        icon={<Lock aria-hidden="true" className="size-4" />}
      >
        <AlertTitle>{t('title')}</AlertTitle>
        <AlertDescription>
          {hasSaveConflict ? t('conflictDescription') : t('description')}
        </AlertDescription>
        <AlertActions>
          <Button
            withWrapper={false}
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={onDuplicate}
            isLoading={isDuplicating}
          >
            {t('duplicateToEdit')}
          </Button>
        </AlertActions>
      </Alert>
    </div>
  );
}
