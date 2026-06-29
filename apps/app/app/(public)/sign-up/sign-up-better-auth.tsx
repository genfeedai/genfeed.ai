'use client';

import { signIn } from '@genfeedai/auth-client';
import { ButtonVariant } from '@genfeedai/enums';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { FaGithub } from 'react-icons/fa6';
import { persistOnboardingHandoffParams } from '@/lib/onboarding/onboarding-access.util';
import {
  getAuthCallbackURL,
  toAbsoluteAuthCallbackURL,
} from '../auth-callback-url';

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function SignUpBetterAuth() {
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
  const authCallbackURL = toAbsoluteAuthCallbackURL(callbackURL);

  useEffect(() => {
    persistOnboardingHandoffParams(window.location.search);
  }, []);

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await signIn.magicLink({
        callbackURL: authCallbackURL,
        email,
      });
      if (result?.error) {
        setErrorMessage(
          result.error.message ??
            'Failed to send sign-up link. Please try again.',
        );
      } else {
        setIsEmailSent(true);
      }
    } catch {
      setErrorMessage('Failed to send sign-up link. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSocialSignUp(provider: 'github' | 'google') {
    setErrorMessage(null);
    await signIn.social({ callbackURL: authCallbackURL, provider });
  }

  if (!isMounted) {
    return <AuthFormLayout>{null}</AuthFormLayout>;
  }

  if (isEmailSent) {
    return (
      <AuthFormLayout>
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="gen-heading-sm">Check your email</p>
          <p className="text-sm text-muted-foreground">
            We sent a sign-up link to <strong>{email}</strong>. Click the link
            in the email to continue.
          </p>
        </div>
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout>
      <div className="w-full max-w-sm space-y-6">
        <form onSubmit={handleMagicLink} className="space-y-4">
          <Field label="Email" isRequired>
            <Input
              type="email"
              name="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setEmail(e.target.value)
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
            className="w-full"
            withWrapper={false}
          >
            Continue with email
          </Button>
        </form>

        <div className="relative">
          <div className="gen-divider" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
            or
          </span>
        </div>

        <Button
          type="button"
          variant={ButtonVariant.OUTLINE}
          onClick={() => handleSocialSignUp('google')}
          className="w-full"
          withWrapper={false}
        >
          Continue with Google
        </Button>

        <Button
          type="button"
          variant={ButtonVariant.OUTLINE}
          onClick={() => handleSocialSignUp('github')}
          icon={<FaGithub className="size-4" aria-hidden="true" />}
          className="w-full"
          withWrapper={false}
        >
          Continue with GitHub
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackURL)}`}
            className="text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthFormLayout>
  );
}
