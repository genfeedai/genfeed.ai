'use client';

import LoginBetterAuth from '@app/(public)/login/login-better-auth';
import { ButtonVariant } from '@genfeedai/contracts';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useSignOut } from './use-sign-out';

/**
 * `/logout` shows the sign-in page at once; the sign-out request runs behind
 * it and the actions unlock when it has answered.
 */
export default function LogoutPage() {
  const translate = useTranslations('common');
  const { phase, retry } = useSignOut();

  return (
    <LoginBetterAuth
      isActionsDisabled={phase !== 'done'}
      mode="chooser"
      notice={
        phase === 'failed' ? (
          <Alert variant="destructive">
            <p>{translate('loginForm.signOutFailed')}</p>
            <Button
              type="button"
              variant={ButtonVariant.SECONDARY}
              onClick={retry}
              withWrapper={false}
            >
              {translate('loginForm.signOutRetry')}
            </Button>
          </Alert>
        ) : null
      }
    />
  );
}
