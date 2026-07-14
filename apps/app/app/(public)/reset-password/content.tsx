'use client';

import { resetPassword } from '@genfeedai/auth-client';
import { ButtonVariant } from '@genfeedai/enums';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
  useState,
  useSyncExternalStore,
} from 'react';
import { getAuthCallbackURL, getAuthFlowHref } from '../auth-callback-url';
import {
  AUTH_LINK_CLASS_NAME,
  AUTH_PRIMARY_BUTTON_CLASS_NAME,
  AuthHeading,
} from '../auth-ui';

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;
const MIN_PASSWORD_LENGTH = 8;

function getTokenErrorMessage(errorCode: string | null): string {
  if (errorCode) {
    return 'This password reset link is invalid or expired. Request a new link to continue.';
  }

  return 'This password reset link is missing a token. Request a new link to continue.';
}

export default function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const isMounted = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetComplete, setIsResetComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const token = searchParams.get('token');
  const tokenError = searchParams.get('error');
  const callbackURL = getAuthCallbackURL(searchParams);
  const forgotPasswordHref = getAuthFlowHref('/forgot-password', callbackURL);
  const loginHref = getAuthFlowHref('/login/password', callbackURL);
  const hasRecoverableTokenError = Boolean(tokenError || !token);

  async function handlePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage(getTokenErrorMessage(tokenError));
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await resetPassword({
        newPassword,
        token,
      });

      if (result?.error) {
        setErrorMessage(
          result.error.message ??
            'Failed to reset your password. Request a new link and try again.',
        );
      } else {
        setIsResetComplete(true);
      }
    } catch {
      setErrorMessage(
        'Failed to reset your password. Request a new link and try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isMounted) {
    return <AuthFormLayout logoSize="compact">{null}</AuthFormLayout>;
  }

  if (isResetComplete) {
    return (
      <AuthFormLayout logoSize="compact">
        <div className="w-full space-y-4 text-center">
          <CheckCircle2
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Password updated
          </h1>
          <p className="text-sm text-muted-foreground">
            Your password has been reset. Sign in with your new password to
            continue.
          </p>
          <Button
            asChild
            variant={ButtonVariant.DEFAULT}
            className={AUTH_PRIMARY_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            <Link href={loginHref}>Sign in</Link>
          </Button>
        </div>
      </AuthFormLayout>
    );
  }

  if (hasRecoverableTokenError) {
    return (
      <AuthFormLayout logoSize="compact">
        <div className="w-full space-y-4 text-center">
          <RotateCcw
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Reset link expired
          </h1>
          <p className="text-sm text-muted-foreground">
            {getTokenErrorMessage(tokenError)}
          </p>
          <Button
            asChild
            variant={ButtonVariant.DEFAULT}
            className={AUTH_PRIMARY_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            <Link href={forgotPasswordHref}>Request a new reset link</Link>
          </Button>
        </div>
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout logoSize="compact">
      <div className="w-full space-y-6">
        <AuthHeading
          title="Choose a new password"
          description="Enter a new password for your Genfeed account."
        />

        <form onSubmit={handlePasswordReset} className="space-y-4">
          <Field label="New password" isRequired>
            <Input
              type="password"
              name="new-password"
              placeholder="Enter a new password"
              value={newPassword}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setNewPassword(event.target.value)
              }
              isRequired
              isDisabled={isSubmitting}
              hasError={!!errorMessage}
            />
          </Field>

          <Field label="Confirm password" isRequired>
            <Input
              type="password"
              name="confirm-password"
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setConfirmPassword(event.target.value)
              }
              isRequired
              isDisabled={isSubmitting}
              hasError={!!errorMessage}
            />
          </Field>

          {errorMessage ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Link href={forgotPasswordHref} className={AUTH_LINK_CLASS_NAME}>
                Request a new reset link
              </Link>
            </div>
          ) : null}

          <Button
            type="submit"
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={
              !newPassword || !confirmPassword || isSubmitting || !token
            }
            className={AUTH_PRIMARY_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            Reset password
          </Button>
        </form>
      </div>
    </AuthFormLayout>
  );
}
