'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

interface RetiredModelAlertProps {
  modelLabel: string;
  onPick?: () => void;
}

/**
 * The flag for a saved model that was retired. A run that uses it stops until
 * a new model is picked; nothing is swapped silently.
 */
export default function RetiredModelAlert({
  modelLabel,
  onPick,
}: RetiredModelAlertProps) {
  const translate = useTranslations('pages.models.retired');

  return (
    <Alert size="sm" variant="warning">
      <AlertTitle>{translate('title', { model: modelLabel })}</AlertTitle>
      <AlertDescription>{translate('description')}</AlertDescription>
      {onPick ? (
        <AlertActions>
          <Button
            label={translate('pickAction')}
            onClick={onPick}
            size={ButtonSize.SM}
            textTransform="none"
            variant={ButtonVariant.SECONDARY}
          />
        </AlertActions>
      ) : null}
    </Alert>
  );
}
