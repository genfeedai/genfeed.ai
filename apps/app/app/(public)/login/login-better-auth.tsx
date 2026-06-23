'use client';

import { signIn } from '@genfeedai/auth-client';
import { ButtonVariant } from '@genfeedai/enums';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { ArrowLeft, KeyRound, MailCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
  useState,
  useSyncExternalStore,
} from 'react';
import { FcGoogle } from 'react-icons/fc';

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

type LoginMode = 'chooser' | 'magic-link' | 'password';

interface LoginBetterAuthProps {
  mode?: LoginMode;
}

const AUTH_BUTTON_CLASS_NAME =
  'h-10 w-full justify-center gap-3 rounded-md border-border bg-background text-[15px] font-medium tracking-normal shadow-sm hover:bg-accent/50';

const AUTH_LINK_CLASS_NAME =
  'text-sm font-medium text-foreground underline underline-offset-4';

function getCallbackURL(searchParams: Pick<URLSearchParams, 'get'>) {
  return (
    searchParams.get('callbackUrl') ||
    searchParams.get('return_to') ||
    searchParams.get('redirect_url') ||
    '/'
  );
}

function getLoginModeHref(path: string, callbackURL: string) {
  if (callbackURL === '/') {
    return path;
  }

  const params = new URLSearchParams({ callbackUrl: callbackURL });
  return `${path}?${params.toString()}`;
}

export default function LoginBetterAuth({
  mode = 'chooser',
}: LoginBetterAuthProps) {
  const searchParams = useSearchParams();
  const isMounted = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);
  const [isSocialSubmitting, setIsSocialSubmitting] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState<
    string | null
  >(null);
  const [socialErrorMessage, setSocialErrorMessage] = useState<string | null>(
    null,
  );
  const callbackURL = getCallbackURL(searchParams);
  const chooserHref = getLoginModeHref('/login', callbackURL);
  const magicLinkHref = getLoginModeHref('/login/magic-link', callbackURL);
  const passwordHref = getLoginModeHref('/login/password', callbackURL);
  const signUpHref = getLoginModeHref('/sign-up', callbackURL);

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSocialErrorMessage(null);
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
    setSocialErrorMessage(null);
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
    setSocialErrorMessage(null);
    setErrorMessage(null);
    setPasswordErrorMessage(null);
    setIsSocialSubmitting(true);

    try {
      const result = await signIn.social({ provider: 'google', callbackURL });
      if (result?.error) {
        setSocialErrorMessage(
          result.error.message ??
            'Failed to continue with Google. Please try again.',
        );
      }
    } catch {
      setSocialErrorMessage(
        'Failed to continue with Google. Please try again.',
      );
    } finally {
      setIsSocialSubmitting(false);
    }
  }

  if (!isMounted) {
    return <AuthFormLayout logoSize="compact">{null}</AuthFormLayout>;
  }

  if (mode === 'magic-link' && isEmailSent) {
    return (
      <AuthFormLayout logoSize="compact">
        <div className="w-full max-w-sm space-y-4 text-center">
          <MailCheck
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-3xl font-semibold tracking-normal">
            Check your email
          </p>
          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to <strong>{email}</strong>. Click the link
            in the email to sign in.
          </p>
          <Button
            asChild
            variant={ButtonVariant.OUTLINE}
            className={AUTH_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            <Link href={chooserHref}>Back to sign in</Link>
          </Button>
        </div>
      </AuthFormLayout>
    );
  }

  if (mode === 'magic-link') {
    return (
      <AuthFormLayout logoSize="compact">
        <div className="w-full max-w-[320px] space-y-8">
          <AuthHeader
            title="Sign in with a magic link"
            description="Enter your email and we'll send you a secure sign-in link."
          />

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
              className="h-10 w-full justify-center text-[15px] font-medium tracking-normal"
              withWrapper={false}
            >
              Email me a sign-in link
            </Button>
          </form>

          <BackToChooser href={chooserHref} />
        </div>
      </AuthFormLayout>
    );
  }

  if (mode === 'password') {
    return (
      <AuthFormLayout logoSize="compact">
        <div className="w-full max-w-[320px] space-y-8">
          <AuthHeader
            title="Sign in with email and password"
            description="Use the email and password attached to your Genfeed account."
          />

          <form onSubmit={handleEmailPassword} className="space-y-4">
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
                isDisabled={isPasswordSubmitting}
                hasError={!!passwordErrorMessage}
              />
            </Field>

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
              variant={ButtonVariant.DEFAULT}
              isLoading={isPasswordSubmitting}
              isDisabled={!email || !password || isPasswordSubmitting}
              className="h-10 w-full justify-center text-[15px] font-medium tracking-normal"
              withWrapper={false}
            >
              Sign in
            </Button>
          </form>

          <BackToChooser href={chooserHref} />
        </div>
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout logoSize="compact">
      <div className="w-full max-w-[320px] space-y-8">
        <AuthHeader title="Welcome Back" description="Sign in to Genfeed" />

        <div className="space-y-4">
          <Button
            type="button"
            variant={ButtonVariant.OUTLINE}
            onClick={handleGoogleSignIn}
            icon={<FcGoogle className="size-4" aria-hidden="true" />}
            isLoading={isSocialSubmitting}
            className={AUTH_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            Sign in with Google
          </Button>

          <Button
            asChild
            variant={ButtonVariant.OUTLINE}
            className={AUTH_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            <Link href={magicLinkHref}>
              <Sparkles className="size-4" aria-hidden="true" />
              <span>Sign in with a magic link</span>
            </Link>
          </Button>

          <Button
            asChild
            variant={ButtonVariant.OUTLINE}
            className={AUTH_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            <Link href={passwordHref}>
              <KeyRound className="size-4" aria-hidden="true" />
              <span>Sign in with email and password</span>
            </Link>
          </Button>
        </div>

        {socialErrorMessage ? (
          <p className="text-center text-sm text-destructive">
            {socialErrorMessage}
          </p>
        ) : null}

        <p className="text-center text-xs leading-5 text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href={signUpHref} className={AUTH_LINK_CLASS_NAME}>
            Sign up
          </Link>
        </p>
      </div>
    </AuthFormLayout>
  );
}

function AuthHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="space-y-2 text-center">
      <h1 className="text-3xl font-semibold tracking-normal text-foreground">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function BackToChooser({ href }: { href: string }) {
  return (
    <div className="text-center">
      <Link
        href={href}
        className="inline-flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to sign in options
      </Link>
    </div>
  );
}
