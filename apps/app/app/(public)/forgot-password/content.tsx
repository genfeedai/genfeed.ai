'use client';

import { requestPasswordReset } from '@genfeedai/auth-client';
import { ButtonVariant } from '@genfeedai/enums';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { useSearchParams } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  getAuthCallbackURL,
  getAuthFlowHref,
  toAbsoluteAuthCallbackURL,
} from '../auth-callback-url';
import {
  AUTH_PRIMARY_BUTTON_CLASS_NAME,
  AuthBackLink,
  AuthCheckEmail,
  AuthHeading,
} from '../auth-ui';

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const isMounted = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const callbackURL = getAuthCallbackURL(searchParams);
  const loginHref = getAuthFlowHref('/login/password', callbackURL);
  const resetPath = getAuthFlowHref('/reset-password', callbackURL);
  const resetRedirectTo = toAbsoluteAuthCallbackURL(resetPath);

  async function handlePasswordResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await requestPasswordReset({
        email,
        redirectTo: resetRedirectTo,
      });

      if (result?.error) {
        setErrorMessage(
          result.error.message ??
            'Failed to request a reset link. Please try again.',
        );
      } else {
        setIsEmailSent(true);
      }
    } catch {
      setErrorMessage('Failed to request a reset link. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isMounted) {
    return <AuthFormLayout logoSize="compact">{null}</AuthFormLayout>;
  }

  if (isEmailSent) {
    return (
      <AuthFormLayout logoSize="compact">
        <AuthCheckEmail
          title="Check your email"
          description={
            <>
              If an account exists for <strong>{email}</strong>, we&apos;ll send
              a password reset link.
            </>
          }
          backHref={loginHref}
          backLabel="Back to sign in"
        />
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout logoSize="compact">
      <div className="w-full space-y-6">
        <AuthHeading
          title="Reset your password"
          description="Enter your account email and we'll send you a secure reset link."
        />

        <form onSubmit={handlePasswordResetRequest} className="space-y-4">
          <Field label="Email" isRequired>
            <Input
              type="email"
              name="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setEmail(event.target.value)
              }
              isRequired
              isDisabled={isSubmitting}
              hasError={!!errorMessage}
            />
          </Field>

          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}

          <Button
            type="submit"
            variant={ButtonVariant.DEFAULT}
            isLoading={isSubmitting}
            isDisabled={!email || isSubmitting}
            className={AUTH_PRIMARY_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            Email me a reset link
          </Button>
        </form>

        <AuthBackLink href={loginHref}>Back to sign in</AuthBackLink>
      </div>
    </AuthFormLayout>
  );
}
