'use client';

import { getSession, signIn } from '@genfeedai/auth-client';
import { resolveAuthContinuation } from '@genfeedai/auth-client/callback';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { GoogleColorIcon } from '@genfeedai/helpers/ui/icons/brands';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { KeyRound, Mail, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import AuthActionSurface from '@/components/layouts/auth/AuthActionSurface';
import AuthFormLayout from '@/components/layouts/auth/AuthFormLayout';
import type {
  InvitationNotice,
  LoginBetterAuthProps,
} from '@/features/auth/props/login-better-auth.props';
import { useIsDesktopClient } from '@/hooks/ui/use-is-desktop-client/use-is-desktop-client';
import { getDesktopBridge } from '@/lib/desktop/runtime';
import { useDesktopLocalWorkspaceFlag } from '@/lib/desktop/use-desktop-local-workspace-flag';

import {
  getAuthCallbackURL,
  getAuthErrorCallbackURL,
  getAuthFlowHref,
  resolveOAuthLoginErrorMessage,
  toAbsoluteAuthCallbackURL,
  toAbsoluteMagicLinkCallbackURL,
} from '../auth-callback-url';
import AuthShowcaseAside from '../auth-showcase-aside';
import {
  AUTH_LINK_CLASS_NAME,
  AUTH_PRIMARY_BUTTON_CLASS_NAME,
  AUTH_SECONDARY_BUTTON_CLASS_NAME,
  AuthBackLink,
  AuthFooterPrompt,
  AuthFormActions,
} from '../auth-ui';
import { useIsGoogleSignInAvailable } from '../use-is-google-sign-in-available';
import { useIsMagicLinkAvailable } from '../use-is-magic-link-available';
import { SUBMIT_REDIRECTING, useSingleSubmit } from '../use-single-submit';
import { useTurnstileToken } from '../use-turnstile-token';
import {
  createLoginFlowState,
  getLoginErrorMessage,
  isLoginSubmitting,
  isWaitingForDesktopSession,
  loginFlowReducer,
} from './login-flow-state';

const LOGIN_TITLE = 'Welcome back';
const LOGIN_DESCRIPTION = 'Sign in to Genfeed';
const DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE =
  'Desktop sign-in is unavailable because the desktop bridge could not be loaded.';
const DESKTOP_SESSION_UNCONFIRMED_MESSAGE =
  'Your desktop sign-in completed, but the browser session could not be confirmed. Please try again.';
const DESKTOP_IPC_ERROR_PREFIX =
  /Error invoking remote method '[^']+':(?: Error:)?\s*/;

function readDesktopBridgeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return fallback;
  }

  const message = error.message.replace(DESKTOP_IPC_ERROR_PREFIX, '').trim();
  return message || fallback;
}

function getInvitationNotice(
  outcome: string | null,
): InvitationNotice | undefined {
  switch (outcome) {
    case 'accepted':
      return {
        message:
          'Invitation accepted. Sign in to continue to your organization.',
        variant: 'success',
      };
    case 'already-accepted':
      return {
        message:
          'This invitation was already accepted. Sign in, or ask an organization admin to resend it.',
        variant: 'info',
      };
    case 'expired':
      return {
        message:
          'This invitation has expired. Ask an organization admin to resend it.',
        variant: 'warning',
      };
    case 'revoked':
      return {
        message:
          'This invitation was revoked. Ask an organization admin for a new invitation.',
        variant: 'warning',
      };
    case 'invalid':
      return {
        message:
          'This invitation link is invalid or no longer available. Ask an organization admin for a new invitation.',
        variant: 'destructive',
      };
    default:
      return undefined;
  }
}

export type { LoginBetterAuthProps };

export default function LoginBetterAuth({
  callbackURL: requestedCallbackURL,
  description = LOGIN_DESCRIPTION,
  mode = 'chooser',
  title = LOGIN_TITLE,
}: LoginBetterAuthProps) {
  const translate = useTranslations('common');
  const searchParams = useSearchParams();
  const isDesktop = useIsDesktopClient();
  const isGoogleSignInAvailable = useIsGoogleSignInAvailable();
  const isMagicLinkAvailable = useIsMagicLinkAvailable();
  const { getCaptchaFetchOptions } = useTurnstileToken();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // The single-submit guards drop a double submit before React re-renders;
  // the flow reducer owns what the page shows.
  const { runSubmit: runMagicLinkSubmit } = useSingleSubmit();
  const { runSubmit: runPasswordSubmit } = useSingleSubmit();
  const [flow, dispatchFlow] = useReducer(
    loginFlowReducer,
    searchParams.get('error'),
    (error: string | null) =>
      createLoginFlowState(resolveOAuthLoginErrorMessage(error)),
  );
  const [isDesktopBridgeAvailable, setIsDesktopBridgeAvailable] =
    useState(false);
  const [desktopAuthCode, setDesktopAuthCode] = useState('');
  const isSubmitting = isLoginSubmitting(flow, 'magic_link');
  const isPasswordSubmitting = isLoginSubmitting(flow, 'password');
  const isSocialSubmitting = isLoginSubmitting(flow, 'social');
  const isStartingLocalMode = isLoginSubmitting(flow, 'local');
  const isSubmittingDesktopCode = isLoginSubmitting(flow, 'desktop_code');
  const isWaitingForDesktopCode = isWaitingForDesktopSession(flow);
  const errorMessage = getLoginErrorMessage(flow, 'magic_link');
  const passwordErrorMessage = getLoginErrorMessage(flow, 'password');
  const socialErrorMessage = getLoginErrorMessage(flow, 'social');
  const desktopErrorMessage = getLoginErrorMessage(flow, 'desktop');
  const {
    isAvailable: isLocalWorkspaceAvailable,
    isEnabled: isLocalWorkspaceEnabled,
    isReady: isLocalWorkspaceReady,
  } = useDesktopLocalWorkspaceFlag();
  const desktopSessionUnsubscribeRef = useRef<(() => void) | null>(null);
  const isWaitingForDesktopSessionRef = useRef(false);
  const callbackURL =
    resolveAuthContinuation(requestedCallbackURL ?? null) ??
    getAuthCallbackURL(searchParams);
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
      dispatchFlow({
        message: DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE,
        method: 'desktop',
        type: 'fail',
      });
      setIsDesktopBridgeAvailable(false);
      return () => {
        abortController.abort();
      };
    }

    dispatchFlow({ type: 'desktop_bridge_ready' });
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
            dispatchFlow({
              message: DESKTOP_SESSION_UNCONFIRMED_MESSAGE,
              method: 'desktop',
              type: 'fail',
            });
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
          dispatchFlow({
            message: DESKTOP_SESSION_UNCONFIRMED_MESSAGE,
            method: 'desktop',
            type: 'fail',
          });
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
      dispatchFlow({
        message: DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE,
        method: 'desktop',
        type: 'fail',
      });
      setIsDesktopBridgeAvailable(false);
      return;
    }

    isWaitingForDesktopSessionRef.current = true;
    dispatchFlow({ type: 'wait_for_desktop_session' });

    try {
      // Sign-in runs in the system browser (password managers work there);
      // the shell reopens this continuation once the callback lands.
      await bridge.auth.login(callbackURL === '/' ? undefined : callbackURL);
    } catch {
      isWaitingForDesktopSessionRef.current = false;
      dispatchFlow({
        message: 'The system browser could not be opened. Please try again.',
        method: 'desktop',
        type: 'fail',
      });
    }
  }

  function handleDesktopBack() {
    isWaitingForDesktopSessionRef.current = false;
    dispatchFlow({ type: 'reset' });
    setDesktopAuthCode('');
  }

  async function handleDesktopCompleteWithCode(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const bridge = getDesktopBridge();
    const code = desktopAuthCode.trim();

    if (!bridge) {
      dispatchFlow({
        errorMessage: DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE,
        type: 'wait_for_desktop_session',
      });
      return;
    }

    if (!code) {
      dispatchFlow({
        errorMessage: 'Paste the sign-in code from the browser.',
        type: 'wait_for_desktop_session',
      });
      return;
    }

    dispatchFlow({ method: 'desktop_code', type: 'submit' });

    try {
      await bridge.auth.completeWithCode(code);
    } catch (error) {
      isWaitingForDesktopSessionRef.current = true;
      dispatchFlow({
        errorMessage: readDesktopBridgeError(
          error,
          'The sign-in code could not be used. Copy it again from the browser.',
        ),
        type: 'wait_for_desktop_session',
      });
    }
  }

  async function handleDesktopLocalMode() {
    if (!isLocalWorkspaceAvailable || !isLocalWorkspaceEnabled) {
      return;
    }

    const bridge = getDesktopBridge();
    if (!bridge) {
      dispatchFlow({
        message:
          'Local mode is unavailable because the desktop bridge could not be loaded.',
        method: 'desktop',
        type: 'fail',
      });
      return;
    }

    dispatchFlow({ method: 'local', type: 'submit' });
    try {
      await bridge.app.enableOfflineMode();
      window.location.assign(APP_ROUTES.DESKTOP.LOCAL);
    } catch (error) {
      dispatchFlow({
        message:
          error instanceof Error
            ? error.message
            : 'Local mode could not start. Your local data is still safe.',
        method: 'desktop',
        type: 'fail',
      });
    }
  }

  function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return runMagicLinkSubmit(sendMagicLink);
  }

  async function sendMagicLink() {
    dispatchFlow({ method: 'magic_link', type: 'submit' });

    try {
      const result = await signIn.magicLink({
        callbackURL: toAbsoluteMagicLinkCallbackURL(callbackURL),
        email,
        fetchOptions: await getCaptchaFetchOptions(),
      });
      if (result?.error) {
        dispatchFlow({
          message:
            result.error.message ??
            'Failed to send sign-in link. Please try again.',
          method: 'magic_link',
          type: 'fail',
        });
      } else {
        dispatchFlow({ type: 'link_sent' });
      }
    } catch {
      dispatchFlow({
        message: 'Failed to send sign-in link. Please try again.',
        method: 'magic_link',
        type: 'fail',
      });
    }
  }

  function handleEmailPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return runPasswordSubmit(signInWithPassword);
  }

  async function signInWithPassword() {
    dispatchFlow({ method: 'password', type: 'submit' });

    try {
      const result = await signIn.email({
        callbackURL: authCallbackURL,
        email,
        password,
      });
      if (result?.error) {
        dispatchFlow({
          message:
            result.error.message ??
            'Failed to sign in with email and password. Please try again.',
          method: 'password',
          type: 'fail',
        });
        return;
      }

      // Better Auth may not navigate when the session is already warm after an
      // API bounce. Always land on the requested post-auth destination.
      window.location.assign(authCallbackURL);
      // Keep the form locked until the navigation lands.
      return SUBMIT_REDIRECTING;
    } catch {
      dispatchFlow({
        message: 'Failed to sign in with email and password. Please try again.',
        method: 'password',
        type: 'fail',
      });
    }
  }

  async function handleSocialSignIn(provider: 'google') {
    dispatchFlow({ method: 'social', type: 'submit' });

    try {
      const result = await signIn.social({
        callbackURL: authCallbackURL,
        errorCallbackURL: getAuthErrorCallbackURL(callbackURL),
        provider,
      });
      if (result?.error) {
        dispatchFlow({
          message:
            result.error.message ??
            'Failed to continue with Google. Please try again.',
          method: 'social',
          type: 'fail',
        });
        return;
      }
      // Better Auth navigates to Google; until then the chooser is idle again.
      dispatchFlow({ type: 'reset' });
    } catch {
      dispatchFlow({
        message: 'Failed to continue with Google. Please try again.',
        method: 'social',
        type: 'fail',
      });
    }
  }

  if (isDesktop) {
    return (
      <AuthFormLayout
        description={translate('loginForm.desktopDescription')}
        logoSize="compact"
        title={translate('loginForm.connectTitle')}
      >
        <AuthActionSurface
          actions={
            isWaitingForDesktopCode ? (
              <Form
                onSubmit={(event) => void handleDesktopCompleteWithCode(event)}
              >
                <Field label={translate('loginForm.signInCode')}>
                  <Input
                    autoComplete="off"
                    name="desktop-signin-code"
                    placeholder={translate('loginForm.signInCodePlaceholder')}
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
                  {translate('loginForm.back')}
                </Button>
              </Form>
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
                  {translate('loginForm.signInWithGenfeed')}
                </Button>
                {isLocalWorkspaceAvailable ? (
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
                ) : null}
              </>
            )
          }
          error={desktopErrorMessage}
          hideHeading
          supportingCopy={
            <div className="space-y-2">
              {isWaitingForDesktopCode ? (
                <>
                  <p aria-live="polite">
                    {translate('loginForm.waitingForBrowser')}
                  </p>
                  <p>{translate('desktopAuth.pasteCodeHint')}</p>
                </>
              ) : isLocalWorkspaceAvailable ? (
                <p>
                  {isLocalWorkspaceEnabled
                    ? 'Local mode keeps its database and workspace files on this Mac. It starts only when you choose it.'
                    : isLocalWorkspaceReady
                      ? 'Local workspace is coming soon. Sign in with Genfeed Cloud.'
                      : 'Checking whether local workspace is available…'}
                </p>
              ) : null}
            </div>
          }
        />
      </AuthFormLayout>
    );
  }

  if (mode === 'magic-link' && flow.status === 'link_sent') {
    return (
      <AuthFormLayout
        description={
          <>
            <p>
              {translate('loginForm.sentLinkTo')}{' '}
              <strong className="break-all font-medium text-foreground">
                {email}
              </strong>
            </p>
            <p>{translate('loginForm.clickEmailLink')}</p>
          </>
        }
        aside={<AuthShowcaseAside />}
        logoSize="compact"
        title={translate('loginForm.checkEmail')}
        headingIcon={
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-foreground">
            <Mail className="size-5" aria-hidden="true" />
          </div>
        }
      >
        <AuthBackLink
          href={chooserHref}
          label={translate('loginForm.backToSignIn')}
        />
      </AuthFormLayout>
    );
  }

  if (mode === 'magic-link') {
    return (
      <AuthFormLayout
        description={translate('loginForm.magicLinkDescription')}
        aside={<AuthShowcaseAside />}
        logoSize="compact"
        title={translate('loginForm.magicLinkTitle')}
      >
        <div className="w-full space-y-6">
          <Form onSubmit={handleMagicLink}>
            <Field label={translate('loginForm.email')} isRequired>
              <Input
                type="email"
                name="email"
                placeholder={translate('loginForm.emailPlaceholder')}
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
                {translate('loginForm.sendLink')}
              </Button>
            </AuthFormActions>
          </Form>
        </div>
      </AuthFormLayout>
    );
  }

  if (mode === 'password') {
    return (
      <AuthFormLayout
        description={translate('loginForm.passwordDescription')}
        aside={<AuthShowcaseAside />}
        logoSize="compact"
        title={translate('loginForm.passwordTitle')}
      >
        <div className="w-full space-y-6">
          <Form onSubmit={handleEmailPassword}>
            <Field label={translate('loginForm.email')} isRequired>
              <Input
                type="email"
                name="email"
                placeholder={translate('loginForm.emailPlaceholder')}
                value={email}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
                isRequired
                isDisabled={isPasswordSubmitting}
                hasError={!!passwordErrorMessage}
              />
            </Field>

            <Field label={translate('loginForm.password')} isRequired>
              <Input
                type="password"
                name="password"
                placeholder={translate('loginForm.passwordPlaceholder')}
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
                {translate('loginForm.forgotPassword')}
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
                {translate('loginForm.signIn')}
              </Button>
            </AuthFormActions>
          </Form>
        </div>
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout
      description={description}
      aside={<AuthShowcaseAside />}
      logoSize="compact"
      title={title}
    >
      <div className="w-full space-y-4">
        {invitationNotice ? (
          <Alert variant={invitationNotice.variant}>
            {invitationNotice.message}
          </Alert>
        ) : null}
        <AuthActionSurface
          actions={
            <>
              {isGoogleSignInAvailable ? (
                <Button
                  type="button"
                  variant={ButtonVariant.SECONDARY}
                  onClick={() => handleSocialSignIn('google')}
                  icon={
                    <GoogleColorIcon className="size-4" aria-hidden="true" />
                  }
                  isLoading={isSocialSubmitting}
                  className={AUTH_SECONDARY_BUTTON_CLASS_NAME}
                  withWrapper={false}
                >
                  {translate('loginForm.google')}
                </Button>
              ) : null}

              {isMagicLinkAvailable ? (
                <Button
                  asChild
                  variant={ButtonVariant.SECONDARY}
                  className={AUTH_SECONDARY_BUTTON_CLASS_NAME}
                  withWrapper={false}
                >
                  <Link href={magicLinkHref}>
                    <Sparkles className="size-4" aria-hidden="true" />
                    <span>{translate('loginForm.magicLink')}</span>
                  </Link>
                </Button>
              ) : null}

              <Button
                asChild
                variant={ButtonVariant.SECONDARY}
                className={AUTH_SECONDARY_BUTTON_CLASS_NAME}
                withWrapper={false}
              >
                <Link href={passwordHref}>
                  <KeyRound className="size-4" aria-hidden="true" />
                  <span>{translate('loginForm.emailPassword')}</span>
                </Link>
              </Button>
            </>
          }
          error={socialErrorMessage}
          footer={
            <AuthFooterPrompt>
              {translate('loginForm.noAccount')}{' '}
              <Link href={signUpHref} className={AUTH_LINK_CLASS_NAME}>
                {translate('loginForm.signUp')}
              </Link>
            </AuthFooterPrompt>
          }
          hideHeading
        />
      </div>
    </AuthFormLayout>
  );
}
