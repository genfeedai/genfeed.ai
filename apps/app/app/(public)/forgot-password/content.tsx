'use client';

import { requestPasswordReset } from '@genfeedai/auth-client';
import { ButtonVariant } from '@genfeedai/contracts';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { useSearchParams } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import {
  getAuthCallbackURL,
  getAuthFlowHref,
  toAbsolutePasswordResetURL,
} from '../auth-callback-url';
import {
  AUTH_PRIMARY_BUTTON_CLASS_NAME,
  AuthCheckEmail,
  AuthFormActions,
} from '../auth-ui';

export default function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const callbackURL = getAuthCallbackURL(searchParams);
  const loginHref = getAuthFlowHref('/login/password', callbackURL);
  const resetPath = getAuthFlowHref('/reset-password', callbackURL);
  const resetRedirectTo = toAbsolutePasswordResetURL(resetPath);

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

  if (isEmailSent) {
    return (
      <AuthFormLayout
        description={
          <>
            If an account exists for <strong>{email}</strong>, we&apos;ll send a
            password reset link.
          </>
        }
        logoSize="compact"
        title="Check your email"
      >
        <AuthCheckEmail backHref={loginHref} />
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout
      description="Enter your account email and we'll send you a secure reset link."
      logoSize="compact"
      title="Reset your password"
    >
      <div className="w-full space-y-6">
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

          <AuthFormActions backHref={loginHref}>
            <Button
              type="submit"
              variant={ButtonVariant.DEFAULT}
              isLoading={isSubmitting}
              isDisabled={!email || isSubmitting}
              className={AUTH_PRIMARY_BUTTON_CLASS_NAME}
              withWrapper={false}
            >
              Send link
            </Button>
          </AuthFormActions>
        </form>
      </div>
    </AuthFormLayout>
  );
}
