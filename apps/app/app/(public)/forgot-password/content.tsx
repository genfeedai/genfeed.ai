'use client';

import { requestPasswordReset } from '@genfeedai/auth-client';
import { ButtonVariant } from '@genfeedai/enums';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { ArrowLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';
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

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

const AUTH_BUTTON_CLASS_NAME =
  'h-10 w-full justify-center text-[15px] font-medium tracking-normal';

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
        <div className="w-full max-w-sm space-y-4 text-center">
          <MailCheck
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-semibold tracking-normal">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">
            If an account exists for <strong>{email}</strong>, we&apos;ll send a
            password reset link.
          </p>
          <Button
            asChild
            variant={ButtonVariant.OUTLINE}
            className="h-10 w-full justify-center gap-3 rounded-md border-border bg-background text-[15px] font-medium tracking-normal shadow-sm hover:bg-accent/50"
            withWrapper={false}
          >
            <Link href={loginHref}>Back to sign in</Link>
          </Button>
        </div>
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout logoSize="compact">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">
            Reset your password
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your account email and we&apos;ll send you a secure reset
            link.
          </p>
        </div>

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
            className={AUTH_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            Email me a reset link
          </Button>
        </form>

        <div className="text-center">
          <Link
            href={loginHref}
            className="inline-flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthFormLayout>
  );
}
