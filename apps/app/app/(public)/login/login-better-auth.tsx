'use client';

import { getSession, signIn } from '@genfeedai/auth-client';
import { isDesktopClient } from '@genfeedai/config/deployment';
import { AlertCategory, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { GoogleColorIcon } from '@genfeedai/helpers/ui/icons/brands';
import Alert from '@ui/feedback/alert/Alert';
import AuthActionSurface from '@ui/layouts/auth/AuthActionSurface';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { KeyRound, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { getDesktopBridge } from '@/lib/desktop/runtime';
import { useDesktopLocalWorkspaceFlag } from '@/lib/desktop/use-desktop-local-workspace-flag';

import {
  getAuthCallbackURL,
  getAuthFlowHref,
  toAbsoluteAuthCallbackURL,
} from '../auth-callback-url';
import {
  AUTH_LINK_CLASS_NAME,
  AUTH_PRIMARY_BUTTON_CLASS_NAME,
  AUTH_SECONDARY_BUTTON_CLASS_NAME,
  AuthCheckEmail,
  AuthFooterPrompt,
  AuthFormActions,
} from '../auth-ui';

/**
 * Desktop vs web is decided on the server (`isDesktopServerRequest`) so the
 * first HTML is already the right surface. `useSyncExternalStore` keeps that
 * snapshot through hydration, then follows `isDesktopClient()` if the runtime
 * config later disagrees. Web LCP still ships the full sign-in form; desktop
 * never paints the web chooser first.
 */
const subscribeToClientSurface = () => () => {};
const LOGIN_TITLE = 'Welcome back';
const LOGIN_DESCRIPTION = 'Sign in to Genfeed';
const DESKTOP_IPC_ERROR_PREFIX =
  /Error invoking remote method '[^']+':(?: Error:)?\s*/;

function readDesktopBridgeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return fallback;
  }

  const message = error.message.replace(DESKTOP_IPC_ERROR_PREFIX, '').trim();
  return message || fallback;
}

type LoginMode = 'chooser' | 'magic-link' | 'password';
type InvitationNotice = {
  message: string;
  type: AlertCategory;
};

function getInvitationNotice(
  outcome: string | null,
): InvitationNotice | undefined {
  switch (outcome) {
    case 'accepted':
      return {
        message:
          'Invitation accepted. Sign in to continue to your organization.',
        type: AlertCategory.SUCCESS,
      };
    case 'already-accepted':
      return {
        message:
          'This invitation was already accepted. Sign in, or ask an organization admin to resend it.',
        type: AlertCategory.INFO,
      };
    case 'expired':
      return {
        message:
          'This invitation has expired. Ask an organization admin to resend it.',
        type: AlertCategory.WARNING,
      };
    case 'revoked':
      return {
        message:
          'This invitation was revoked. Ask an organization admin for a new invitation.',
        type: AlertCategory.WARNING,
      };
    case 'invalid':
      return {
        message:
          'This invitation link is invalid or no longer available. Ask an organization admin for a new invitation.',
        type: AlertCategory.ERROR,
      };
    default:
      return undefined;
  }
}

export interface LoginBetterAuthProps {
  isDesktopShell?: boolean;
  mode?: LoginMode;
}

export default function LoginBetterAuth({
  isDesktopShell = false,
  mode = 'chooser',
}: LoginBetterAuthProps) {
  const translate = useTranslations('common');
  const searchParams = useSearchParams();
  const isDesktop = useSyncExternalStore(
    subscribeToClientSurface,
    () => isDesktopClient() || isDesktopShell,
    () => isDesktopShell,
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
  const [desktopErrorMessage, setDesktopErrorMessage] = useState<string | null>(
    null,
  );
  const [isDesktopBridgeAvailable, setIsDesktopBridgeAvailable] =
    useState(false);
  const [isWaitingForDesktopSession, setIsWaitingForDesktopSession] =
    useState(false);
  const [isStartingLocalMode, setIsStartingLocalMode] = useState(false);
  const [desktopAuthCode, setDesktopAuthCode] = useState('');
  const [isSubmittingDesktopCode, setIsSubmittingDesktopCode] = useState(false);
  const { isEnabled: isLocalWorkspaceEnabled, isReady: isLocalWorkspaceReady } =
    useDesktopLocalWorkspaceFlag();
  const desktopSessionUnsubscribeRef = useRef<(() => void) | null>(null);
  const isWaitingForDesktopSessionRef = useRef(false);
  const callbackURL = getAuthCallbackURL(searchParams);
  const authCallbackURL = toAbsoluteAuthCallbackURL(callbackURL);
  const chooserHref = getAuthFlowHref('/login', callbackURL);
  const magicLinkHref = getAuthFlowHref('/login/magic-link', callbackURL);
  const passwordHref = getAuthFlowHref('/login/password', callbackURL);
  const forgotPasswordHref = getAuthFlowHref('/forgot-password', callbackURL);
  const signUpHref = getAuthFlowHref('/sign-up', callbackURL);
  const invitationNotice = getInvitationNotice(searchParams.get('invitation'));

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    const abortController = new AbortController();
    const bridge = getDesktopBridge();

    if (!bridge) {
      setDesktopErrorMessage(
        'Desktop sign-in is unavailable because the desktop bridge could not be loaded.',
      );
      setIsDesktopBridgeAvailable(false);
      return () => {
        abortController.abort();
      };
    }

    setDesktopErrorMessage(null);
    setIsDesktopBridgeAvailable(true);

    const unsubscribe = bridge.auth.onDidChangeSession((session) => {
      if (!session || !isWaitingForDesktopSessionRef.current) {
        return;
      }

      const confirmBrowserSession = async (): Promise<void> => {
        try {
          const result = await getSession();

          if (abortController.signal.aborted) {
            return;
          }

          if (!result.data?.session) {
            isWaitingForDesktopSessionRef.current = false;
            setIsWaitingForDesktopSession(false);
            setDesktopErrorMessage(
              'Your desktop sign-in completed, but the browser session could not be confirmed. Please try again.',
            );
            return;
          }

          isWaitingForDesktopSessionRef.current = false;
          const activeUnsubscribe = desktopSessionUnsubscribeRef.current;
          desktopSessionUnsubscribeRef.current = null;
          activeUnsubscribe?.();
          window.location.assign(authCallbackURL);
        } catch {
          if (abortController.signal.aborted) {
            return;
          }

          isWaitingForDesktopSessionRef.current = false;
          setIsWaitingForDesktopSession(false);
          setDesktopErrorMessage(
            'Your desktop sign-in completed, but the browser session could not be confirmed. Please try again.',
          );
        }
      };

      void confirmBrowserSession();
    });

    desktopSessionUnsubscribeRef.current = unsubscribe;

    return () => {
      abortController.abort();
      isWaitingForDesktopSessionRef.current = false;
      if (desktopSessionUnsubscribeRef.current === unsubscribe) {
        desktopSessionUnsubscribeRef.current = null;
        unsubscribe();
      }
    };
  }, [authCallbackURL, isDesktop]);

  async function handleDesktopLogin() {
    const bridge = getDesktopBridge();

    if (!bridge) {
      setDesktopErrorMessage(
        'Desktop sign-in is unavailable because the desktop bridge could not be loaded.',
      );
      setIsDesktopBridgeAvailable(false);
      return;
    }

    setDesktopErrorMessage(null);
    isWaitingForDesktopSessionRef.current = true;
    setIsWaitingForDesktopSession(true);

    try {
      await bridge.auth.login();
    } catch {
      isWaitingForDesktopSessionRef.current = false;
      setIsWaitingForDesktopSession(false);
      setDesktopErrorMessage(
        'The system browser could not be opened. Please try again.',
      );
    }
  }

  function handleDesktopBack() {
    isWaitingForDesktopSessionRef.current = false;
    setDesktopErrorMessage(null);
    setIsWaitingForDesktopSession(false);
    setDesktopAuthCode('');
    setIsSubmittingDesktopCode(false);
  }

  async function handleDesktopCompleteWithCode(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const bridge = getDesktopBridge();
    const code = desktopAuthCode.trim();

    if (!bridge) {
      setDesktopErrorMessage(
        'Desktop sign-in is unavailable because the desktop bridge could not be loaded.',
      );
      return;
    }

    if (!code) {
      setDesktopErrorMessage('Paste the sign-in code from the browser.');
      return;
    }

    setDesktopErrorMessage(null);
    setIsSubmittingDesktopCode(true);

    try {
      await bridge.auth.completeWithCode(code);
    } catch (error) {
      isWaitingForDesktopSessionRef.current = true;
      setIsWaitingForDesktopSession(true);
      setDesktopErrorMessage(
        readDesktopBridgeError(
          error,
          'The sign-in code could not be used. Copy it again from the browser.',
        ),
      );
      setIsSubmittingDesktopCode(false);
    }
  }

  async function handleDesktopLocalMode() {
    if (!isLocalWorkspaceEnabled) {
      return;
    }

    const bridge = getDesktopBridge();
    if (!bridge) {
      setDesktopErrorMessage(
        'Local mode is unavailable because the desktop bridge could not be loaded.',
      );
      return;
    }

    setDesktopErrorMessage(null);
    setIsStartingLocalMode(true);
    try {
      await bridge.app.enableOfflineMode();
      window.location.assign(APP_ROUTES.DESKTOP.LOCAL);
    } catch (error) {
      setDesktopErrorMessage(
        error instanceof Error
          ? error.message
          : 'Local mode could not start. Your local data is still safe.',
      );
      setIsStartingLocalMode(false);
    }
  }

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSocialErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await signIn.magicLink({
        callbackURL: authCallbackURL,
        email,
      });
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
        callbackURL: authCallbackURL,
        email,
        password,
      });
      if (result?.error) {
        setPasswordErrorMessage(
          result.error.message ??
            'Failed to sign in with email and password. Please try again.',
        );
        return;
      }

      // Better Auth may not navigate when the session is already warm after an
      // API bounce. Always land on the requested post-auth destination.
      window.location.assign(authCallbackURL);
    } catch {
      setPasswordErrorMessage(
        'Failed to sign in with email and password. Please try again.',
      );
    } finally {
      setIsPasswordSubmitting(false);
    }
  }

  async function handleSocialSignIn(provider: 'google') {
    setSocialErrorMessage(null);
    setErrorMessage(null);
    setPasswordErrorMessage(null);
    setIsSocialSubmitting(true);

    try {
      const result = await signIn.social({
        callbackURL: authCallbackURL,
        provider,
      });
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

  if (isDesktop) {
    return (
      <AuthFormLayout
        description="Sign in securely in your system browser."
        logoSize="compact"
        title="Connect to Genfeed"
      >
        <AuthActionSurface
          actions={
            isWaitingForDesktopSession ? (
              <form
                className="space-y-3"
                onSubmit={(event) => void handleDesktopCompleteWithCode(event)}
              >
                <Field label="Sign-in code">
                  <Input
                    autoComplete="off"
                    name="desktop-signin-code"
                    placeholder="Paste the code from the browser"
                    spellCheck={false}
                    value={desktopAuthCode}
                    isDisabled={isSubmittingDesktopCode}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setDesktopAuthCode(event.target.value)
                    }
                  />
                </Field>
                <Button
                  type="submit"
                  variant={ButtonVariant.DEFAULT}
                  isDisabled={
                    !isDesktopBridgeAvailable ||
                    isSubmittingDesktopCode ||
                    desktopAuthCode.trim().length === 0
                  }
                  className={AUTH_PRIMARY_BUTTON_CLASS_NAME}
                  withWrapper={false}
                >
                  {isSubmittingDesktopCode
                    ? 'Connecting…'
                    : 'Continue with code'}
                </Button>
                <Button
                  type="button"
                  variant={ButtonVariant.SECONDARY}
                  onClick={handleDesktopBack}
                  isDisabled={isSubmittingDesktopCode}
                  className={AUTH_SECONDARY_BUTTON_CLASS_NAME}
                  withWrapper={false}
                >
                  Back
                </Button>
              </form>
            ) : (
              <>
                <Button
                  type="button"
                  variant={ButtonVariant.DEFAULT}
                  onClick={() => void handleDesktopLogin()}
                  isDisabled={!isDesktopBridgeAvailable}
                  className={AUTH_PRIMARY_BUTTON_CLASS_NAME}
                  withWrapper={false}
                >
                  Sign in with Genfeed
                </Button>
                <Button
                  type="button"
                  variant={ButtonVariant.SECONDARY}
                  isDisabled={
                    !isLocalWorkspaceEnabled ||
                    !isDesktopBridgeAvailable ||
                    isStartingLocalMode
                  }
                  className={AUTH_SECONDARY_BUTTON_CLASS_NAME}
                  withWrapper={false}
                  onClick={() => void handleDesktopLocalMode()}
                >
                  {isStartingLocalMode
                    ? 'Starting local workspace…'
                    : isLocalWorkspaceEnabled
                      ? 'Use a local workspace'
                      : 'Use a local workspace — coming soon'}
                </Button>
              </>
            )
          }
          error={desktopErrorMessage}
          hideHeading
          supportingCopy={
            <div className="space-y-2">
              {isWaitingForDesktopSession ? (
                <>
                  <p aria-live="polite">Waiting for the browser...</p>
                  <p>{translate('desktopAuth.pasteCodeHint')}</p>
                </>
              ) : (
                <p>
                  {isLocalWorkspaceEnabled
                    ? 'Local mode keeps its database and workspace files on this Mac. It starts only when you choose it.'
                    : isLocalWorkspaceReady
                      ? 'Local workspace is coming soon. Sign in with Genfeed Cloud.'
                      : 'Checking whether local workspace is available…'}
                </p>
              )}
            </div>
          }
        />
      </AuthFormLayout>
    );
  }

  if (mode === 'magic-link' && isEmailSent) {
    return (
      <AuthFormLayout
        description={
          <>
            We sent a sign-in link to <strong>{email}</strong>. Click the link
            in the email to sign in.
          </>
        }
        logoSize="compact"
        title="Check your email"
      >
        <AuthCheckEmail backHref={chooserHref} />
      </AuthFormLayout>
    );
  }

  if (mode === 'magic-link') {
    return (
      <AuthFormLayout
        description="Enter your email and we'll send you a secure sign-in link."
        logoSize="compact"
        title="Sign in with a magic link"
      >
        <div className="w-full space-y-6">
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

            <AuthFormActions backHref={chooserHref}>
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

  if (mode === 'password') {
    return (
      <AuthFormLayout
        description="Use your Genfeed email and password."
        logoSize="compact"
        title="Sign in with password"
      >
        <div className="w-full space-y-6">
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

            <div className="text-right">
              <Link
                href={forgotPasswordHref}
                className={`text-sm ${AUTH_LINK_CLASS_NAME}`}
              >
                Forgot password?
              </Link>
            </div>

            {passwordErrorMessage ? (
              <p className="text-sm text-destructive">{passwordErrorMessage}</p>
            ) : null}

            <AuthFormActions backHref={chooserHref}>
              <Button
                type="submit"
                variant={ButtonVariant.DEFAULT}
                isLoading={isPasswordSubmitting}
                isDisabled={!email || !password || isPasswordSubmitting}
                className={AUTH_PRIMARY_BUTTON_CLASS_NAME}
                withWrapper={false}
              >
                Sign in
              </Button>
            </AuthFormActions>
          </form>
        </div>
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout
      description={LOGIN_DESCRIPTION}
      logoSize="compact"
      title={LOGIN_TITLE}
    >
      <div className="w-full space-y-4">
        {invitationNotice ? (
          <Alert type={invitationNotice.type}>{invitationNotice.message}</Alert>
        ) : null}
        <AuthActionSurface
          actions={
            <>
              <Button
                type="button"
                variant={ButtonVariant.SECONDARY}
                onClick={() => handleSocialSignIn('google')}
                icon={<GoogleColorIcon className="size-4" aria-hidden="true" />}
                isLoading={isSocialSubmitting}
                className={AUTH_SECONDARY_BUTTON_CLASS_NAME}
                withWrapper={false}
              >
                Google
              </Button>

              <Button
                asChild
                variant={ButtonVariant.SECONDARY}
                className={AUTH_SECONDARY_BUTTON_CLASS_NAME}
                withWrapper={false}
              >
                <Link href={magicLinkHref}>
                  <Sparkles className="size-4" aria-hidden="true" />
                  <span>Magic Link</span>
                </Link>
              </Button>

              <Button
                asChild
                variant={ButtonVariant.SECONDARY}
                className={AUTH_SECONDARY_BUTTON_CLASS_NAME}
                withWrapper={false}
              >
                <Link href={passwordHref}>
                  <KeyRound className="size-4" aria-hidden="true" />
                  <span>Email / Password</span>
                </Link>
              </Button>
            </>
          }
          error={socialErrorMessage}
          footer={
            <AuthFooterPrompt>
              Don&apos;t have an account?{' '}
              <Link href={signUpHref} className={AUTH_LINK_CLASS_NAME}>
                Sign up
              </Link>
            </AuthFooterPrompt>
          }
          hideHeading
        />
      </div>
    </AuthFormLayout>
  );
}
