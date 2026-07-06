'use client';

import { signIn } from '@genfeedai/auth-client';
import { ButtonVariant } from '@genfeedai/enums';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { ArrowLeft, MailCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { FcGoogle } from 'react-icons/fc';
import { persistOnboardingHandoffParams } from '@/lib/onboarding/onboarding-access.util';
import {
  getAuthCallbackURL,
  toAbsoluteAuthCallbackURL,
} from '../auth-callback-url';

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

type SignUpMode = 'chooser' | 'magic-link';

interface SignUpBetterAuthProps {
  mode?: SignUpMode;
}

const AUTH_BUTTON_CLASS_NAME =
  'h-10 w-full justify-center gap-3 rounded-md border-border bg-background text-[15px] font-medium tracking-normal shadow-sm hover:bg-accent/50';

const AUTH_LINK_CLASS_NAME =
  'text-sm font-medium text-foreground underline underline-offset-4';

const SIGN_UP_MAGIC_LINK_METADATA = { intent: 'signup' } as const;

function getSignUpModeHref(
  path: string,
  searchParams: Pick<URLSearchParams, 'toString'>,
) {
  const params = searchParams.toString();
  return params ? `${path}?${params}` : path;
}

function getLoginHref(callbackURL: string) {
  if (callbackURL === '/') {
    return '/login';
  }

  const params = new URLSearchParams({ callbackUrl: callbackURL });
  return `/login?${params.toString()}`;
}

export default function SignUpBetterAuth({
  mode = 'chooser',
}: SignUpBetterAuthProps) {
  const searchParams = useSearchParams();
  const isMounted = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSocialSubmitting, setIsSocialSubmitting] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [socialErrorMessage, setSocialErrorMessage] = useState<string | null>(
    null,
  );
  const callbackURL = getAuthCallbackURL(searchParams);
  const authCallbackURL = toAbsoluteAuthCallbackURL(callbackURL);
  const chooserHref = getSignUpModeHref('/sign-up', searchParams);
  const magicLinkHref = getSignUpModeHref('/sign-up/magic-link', searchParams);
  const loginHref = getLoginHref(callbackURL);

  useEffect(() => {
    persistOnboardingHandoffParams(window.location.search);
  }, []);

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSocialErrorMessage(null);
    setIsSubmitting(true);

    const normalizedEmail = email.trim().toLowerCase();
    setEmail(normalizedEmail);

    try {
      const result = await signIn.magicLink({
        callbackURL: authCallbackURL,
        email: normalizedEmail,
        metadata: SIGN_UP_MAGIC_LINK_METADATA,
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

  async function handleSocialSignUp(provider: 'google') {
    setSocialErrorMessage(null);
    setErrorMessage(null);
    setIsSocialSubmitting(true);
    try {
      const result = await signIn.social({
        callbackURL: authCallbackURL,
        provider,
      });
      if (result?.error) {
        setSocialErrorMessage(
          result.error.message ??
            'Failed to sign up with Google. Please try again.',
        );
      }
    } catch {
      setSocialErrorMessage('Failed to sign up with Google. Please try again.');
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
          <p className="text-2xl font-semibold tracking-normal">
            Check your email
          </p>
          <p className="text-sm text-muted-foreground">
            We sent a sign-up link to <strong>{email}</strong>. Click the link
            in the email to create your account.
          </p>
          <Button
            asChild
            variant={ButtonVariant.OUTLINE}
            className={AUTH_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            <Link href={chooserHref}>Back to sign up</Link>
          </Button>
        </div>
      </AuthFormLayout>
    );
  }

  if (mode === 'magic-link') {
    return (
      <AuthFormLayout logoSize="compact">
        <div className="w-full max-w-sm space-y-8">
          <AuthHeader
            title="Sign up with a magic link"
            description="Enter your email and we'll send you a secure sign-up link."
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
                autoFocus
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
              isDisabled={!email.trim() || isSubmitting}
              className="h-10 w-full justify-center text-[15px] font-medium tracking-normal"
              withWrapper={false}
            >
              Email me a sign-up link
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
        <AuthHeader
          title="Create your account"
          description="Start using Genfeed"
        />

        <div className="space-y-4">
          <Button
            type="button"
            variant={ButtonVariant.OUTLINE}
            onClick={() => handleSocialSignUp('google')}
            icon={<FcGoogle className="size-4" aria-hidden="true" />}
            isLoading={isSocialSubmitting}
            className={AUTH_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            Google
          </Button>

          <Button
            asChild
            variant={ButtonVariant.OUTLINE}
            className={AUTH_BUTTON_CLASS_NAME}
            withWrapper={false}
          >
            <Link href={magicLinkHref}>
              <Sparkles className="size-4" aria-hidden="true" />
              <span>Magic Link</span>
            </Link>
          </Button>
        </div>

        {socialErrorMessage ? (
          <p className="text-center text-sm text-destructive">
            {socialErrorMessage}
          </p>
        ) : null}

        <p className="text-center text-xs leading-5 text-muted-foreground">
          Already have an account?{' '}
          <Link href={loginHref} className={AUTH_LINK_CLASS_NAME}>
            Sign in
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
      <h1 className="text-2xl font-semibold tracking-normal text-foreground">
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
        Back to sign up options
      </Link>
    </div>
  );
}
