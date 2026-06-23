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
  useState,
  useSyncExternalStore,
} from 'react';

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function LoginBetterAuth() {
  const searchParams = useSearchParams();
  const isMounted = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordModeVisible, setIsPasswordModeVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState<
    string | null
  >(null);
  const callbackURL =
    searchParams.get('callbackUrl') ||
    searchParams.get('return_to') ||
    searchParams.get('redirect_url') ||
    '/';

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await signIn.magicLink({ email, callbackURL });
      if (result?.error) {
        setErrorMessage(
          result.error.message ??
            'Failed to send sign-in link. Please try again.',
        );
      } else {
        setIsEmailSent(true);
      }
    } catch {
      setErrorMessage('Failed to send sign-in link. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEmailPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordErrorMessage(null);
    setIsPasswordSubmitting(true);

    try {
      const result = await signIn.email({
        callbackURL,
        email,
        password,
      });
      if (result?.error) {
        setPasswordErrorMessage(
          result.error.message ??
            'Failed to sign in with email and password. Please try again.',
        );
      }
    } catch {
      setPasswordErrorMessage(
        'Failed to sign in with email and password. Please try again.',
      );
    } finally {
      setIsPasswordSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setErrorMessage(null);
    setPasswordErrorMessage(null);
    await signIn.social({ provider: 'google', callbackURL });
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
            We sent a sign-in link to <strong>{email}</strong>. Click the link
            in the email to sign in.
          </p>
        </div>
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout>
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1.5 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Account access
          </p>
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with a magic link, Google, or your password.
          </p>
        </div>

        <form onSubmit={handleMagicLink} className="space-y-3">
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
            Email me a sign-in link
          </Button>
        </form>

        <Button
          type="button"
          variant={ButtonVariant.OUTLINE}
          onClick={handleGoogleSignIn}
          className="w-full"
          withWrapper={false}
        >
          Continue with Google
        </Button>

        <div className="relative">
          <div className="gen-divider" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            or
          </span>
        </div>

        {isPasswordModeVisible ? (
          <form onSubmit={handleEmailPassword} className="space-y-3">
            <Field label="Password" isRequired>
              <Input
                type="password"
                name="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
                isRequired
                isDisabled={isPasswordSubmitting}
                hasError={!!passwordErrorMessage}
              />
            </Field>

            {passwordErrorMessage ? (
              <p className="text-sm text-destructive">{passwordErrorMessage}</p>
            ) : null}

            <Button
              type="submit"
              variant={ButtonVariant.OUTLINE}
              isLoading={isPasswordSubmitting}
              isDisabled={!email || !password || isPasswordSubmitting}
              className="w-full"
              withWrapper={false}
            >
              Sign in with email and password
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant={ButtonVariant.OUTLINE}
            onClick={() => {
              setIsPasswordModeVisible(true);
              setErrorMessage(null);
            }}
            className="w-full"
            withWrapper={false}
          >
            Use email and password
          </Button>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href={`/sign-up?callbackUrl=${encodeURIComponent(callbackURL)}`}
            className="text-foreground underline underline-offset-4"
          >
            Sign up
          </Link>
        </p>
      </div>
    </AuthFormLayout>
  );
}
