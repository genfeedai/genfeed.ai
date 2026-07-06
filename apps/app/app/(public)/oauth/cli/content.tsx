'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { Code } from '@genfeedai/ui';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { EnvironmentService } from '@services/core/environment.service';
import Spinner from '@ui/feedback/spinner/Spinner';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  HiCheckCircle,
  HiClipboard,
  HiClipboardDocumentCheck,
  HiCommandLine,
  HiXCircle,
} from 'react-icons/hi2';
import { Card, CardContent } from '@/components/ui/card';
import { redirectToCallback } from './callback-redirect';

interface DesktopAuthorizeResponse {
  code: string;
  expiresAt: string;
  state: string;
}

interface CliTokenResponse {
  apiKey?: string;
  key?: string;
  token?: string;
}

const MIN_PORT = 1024;
const MAX_PORT = 65535;
const DESKTOP_CALLBACK_TARGET = 'genfeedai-desktop://auth';
const DESKTOP_CALLBACK_PROTOCOL = 'genfeedai-desktop:';
const DESKTOP_CALLBACK_TIMEOUT_MS = 1500;

type FlowStep =
  | 'validating'
  | 'signing-in'
  | 'requesting-token'
  | 'redirecting'
  | 'success'
  | 'error';

interface FlowState {
  step: FlowStep;
  error: string | null;
  apiKey?: string | null;
}

interface DesktopIdentity {
  firstName?: string | null;
  id?: string;
  lastName?: string | null;
  primaryEmailAddress?: {
    emailAddress?: string | null;
  } | null;
}

function validatePort(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    return null;
  }

  return port;
}

function parseErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw);

    if (
      parsed?.errors &&
      Array.isArray(parsed.errors) &&
      parsed.errors.length > 0
    ) {
      const first = parsed.errors[0];
      return (
        first.message || first.longMessage || first.code || 'Request failed'
      );
    }

    if (parsed?.error) {
      return typeof parsed.error === 'string'
        ? parsed.error
        : parsed.error.message || 'Request failed';
    }

    if (parsed?.message) {
      return parsed.message;
    }
  } catch {
    // Not JSON — return as-is but trim it
  }

  const trimmed = raw.trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

function formatServerError(status: number, body: string): string {
  const message = parseErrorMessage(body);

  switch (status) {
    case 401:
      return 'Unauthorized. Please sign in again.';
    case 403:
      return 'Access denied. You may not have permission to generate CLI keys.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
    case 502:
    case 503:
      return 'Server error. Please try again in a moment.';
    default:
      return message || `Request failed (${status})`;
  }
}

function getDesktopCallbackUrl(
  code: string,
  user: DesktopIdentity | null,
  callbackTarget: string | null,
  state: string | null,
): string {
  const target = callbackTarget || DESKTOP_CALLBACK_TARGET;
  const url = new URL(target);
  url.searchParams.set('code', code);
  if (state) {
    url.searchParams.set('state', state);
  }

  const email = user?.primaryEmailAddress?.emailAddress;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  if (user?.id) {
    url.searchParams.set('userId', user.id);
  }
  if (email) {
    url.searchParams.set('email', email);
  }
  if (name) {
    url.searchParams.set('name', name);
  }

  return url.toString();
}

function isDesktopCallbackTargetValid(value: string | null): boolean {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === DESKTOP_CALLBACK_PROTOCOL && url.hostname === 'auth'
    );
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically random state token (hex string, 32 bytes).
 * Used to bind the page load to the eventual callback redirect so a malicious
 * process cannot hijack the flow by racing for the localhost listener.
 */
function generateStateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function CliAuthPageContent() {
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded, getToken } = useAuthIdentity();
  const { user } = useAuthUser();
  const [flowState, setFlowState] = useState<FlowState>({
    error: null,
    step: 'validating',
  });
  const [copied, setCopied] = useState(false);
  const tokenRequestedRef = useRef(false);
  // State token generated once per page load and sent in the callback URL.
  // The CLI listener must echo it back so we can verify the request originated
  // from this page and not from a racing process on the same machine.
  const stateTokenRef = useRef<string>(generateStateToken());

  const portParam = searchParams.get('port');
  const isDesktopMode = searchParams.get('desktop') === '1';
  const desktopReturnTo = searchParams.get('return_to');
  const desktopState = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');
  const hasPkce = Boolean(codeChallenge && codeChallengeMethod);
  const hasValidDesktopReturnTarget =
    isDesktopCallbackTargetValid(desktopReturnTo);
  const port = validatePort(portParam);
  const callbackPath = `/oauth/cli${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;

  const requestTokenAndRedirect = useCallback(
    async (signal: AbortSignal) => {
      setFlowState({ error: null, step: 'requesting-token' });

      try {
        // Use the standard session JWT accepted by the API auth strategy.
        const token = await resolveAuthToken(getToken);

        if (signal.aborted) {
          return;
        }

        if (!token) {
          setFlowState({
            error: 'Failed to retrieve authentication token. Please try again.',
            step: 'error',
          });
          return;
        }

        // --- Desktop mode: call /auth/desktop/authorize with PKCE params ---
        if (isDesktopMode) {
          if (!codeChallenge || !codeChallengeMethod || !desktopState) {
            setFlowState({
              error:
                'Missing PKCE parameters. Restart sign-in from the Genfeed Desktop app.',
              step: 'error',
            });
            return;
          }

          const response = await fetch(
            `${EnvironmentService.apiEndpoint}/auth/desktop/authorize`,
            {
              body: JSON.stringify({
                codeChallenge,
                codeChallengeMethod,
                returnTo: desktopReturnTo ?? undefined,
                state: desktopState,
              }),
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              method: 'POST',
              signal,
            },
          );

          if (signal.aborted) {
            return;
          }

          if (!response.ok) {
            const errorBody = await response
              .text()
              .catch(() => 'Unknown error');
            setFlowState({
              error: formatServerError(response.status, errorBody),
              step: 'error',
            });
            return;
          }

          const data = (await response.json()) as DesktopAuthorizeResponse;

          if (!data.code) {
            setFlowState({
              error:
                'Server did not return an authorization code. Please try again.',
              step: 'error',
            });
            return;
          }

          setFlowState({ apiKey: data.code, error: null, step: 'redirecting' });

          const callbackUrl = getDesktopCallbackUrl(
            data.code,
            user ?? null,
            desktopReturnTo,
            desktopState,
          );

          await new Promise((resolve) => setTimeout(resolve, 500));

          if (signal.aborted) {
            return;
          }

          let fallbackTimer: number | null = null;
          let handoffCompleted = false;

          const cleanup = () => {
            document.removeEventListener(
              'visibilitychange',
              handleVisibilityChange,
            );
            window.removeEventListener('pagehide', handlePageHide);

            if (fallbackTimer !== null) {
              window.clearTimeout(fallbackTimer);
            }
          };

          const completeHandoff = () => {
            if (signal.aborted || handoffCompleted) {
              return;
            }

            handoffCompleted = true;
            cleanup();
            setFlowState({ apiKey: data.code, error: null, step: 'success' });
          };

          const handlePageHide = () => {
            completeHandoff();
          };

          const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
              completeHandoff();
            }
          };

          document.addEventListener('visibilitychange', handleVisibilityChange);
          window.addEventListener('pagehide', handlePageHide);

          try {
            redirectToCallback(callbackUrl);
          } catch (error) {
            cleanup();
            setFlowState({
              apiKey: data.code,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to open the desktop app. Try again or copy the code below.',
              step: 'error',
            });
            return;
          }

          fallbackTimer = window.setTimeout(() => {
            if (signal.aborted || handoffCompleted) {
              return;
            }

            cleanup();
            setFlowState({
              apiKey: data.code,
              error:
                'Genfeed Desktop did not open automatically. Make sure the app is installed, then try again or copy the code below.',
              step: 'error',
            });
          }, DESKTOP_CALLBACK_TIMEOUT_MS);

          return;
        }

        // --- CLI PKCE mode: code_challenge present, no desktop=1 ---
        if (hasPkce && codeChallenge && codeChallengeMethod && desktopState) {
          const response = await fetch(
            `${EnvironmentService.apiEndpoint}/auth/desktop/authorize`,
            {
              body: JSON.stringify({
                codeChallenge,
                codeChallengeMethod,
                state: desktopState,
              }),
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              method: 'POST',
              signal,
            },
          );

          if (signal.aborted) {
            return;
          }

          if (!response.ok) {
            const errorBody = await response
              .text()
              .catch(() => 'Unknown error');
            setFlowState({
              error: formatServerError(response.status, errorBody),
              step: 'error',
            });
            return;
          }

          const data = (await response.json()) as DesktopAuthorizeResponse;

          if (!data.code) {
            setFlowState({
              error:
                'Server did not return an authorization code. Please try again.',
              step: 'error',
            });
            return;
          }

          setFlowState({ apiKey: data.code, error: null, step: 'redirecting' });

          const callbackUrl = `http://127.0.0.1:${port ?? 0}/callback?code=${encodeURIComponent(data.code)}&state=${encodeURIComponent(desktopState)}`;

          redirectToCallback(callbackUrl);

          setTimeout(() => {
            if (!signal.aborted) {
              setFlowState({ apiKey: data.code, error: null, step: 'success' });
            }
          }, 2000);

          return;
        }

        // --- Legacy CLI mode: no PKCE, use /auth/cli/token ---
        const response = await fetch(
          `${EnvironmentService.apiEndpoint}/auth/cli/token`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
            signal,
          },
        );

        if (signal.aborted) {
          return;
        }

        if (!response.ok) {
          const errorBody = await response.text().catch(() => 'Unknown error');
          setFlowState({
            error: formatServerError(response.status, errorBody),
            step: 'error',
          });
          return;
        }

        const legacyData = (await response.json()) as CliTokenResponse;
        const credential =
          legacyData.key ?? legacyData.apiKey ?? legacyData.token;

        if (!credential) {
          setFlowState({
            error: 'Server did not return an API key. Please try again.',
            step: 'error',
          });
          return;
        }

        setFlowState({ apiKey: credential, error: null, step: 'redirecting' });

        const state = stateTokenRef.current;
        const callbackUrl = isDesktopMode
          ? getDesktopCallbackUrl(
              credential,
              user ?? null,
              desktopReturnTo,
              state,
            )
          : `http://127.0.0.1:${port ?? 0}/callback?key=${encodeURIComponent(credential)}&state=${encodeURIComponent(state)}`;

        redirectToCallback(callbackUrl);

        setTimeout(() => {
          if (!signal.aborted) {
            setFlowState({ apiKey: credential, error: null, step: 'success' });
          }
        }, 2000);
      } catch (err: unknown) {
        if (signal.aborted) {
          return;
        }

        const message =
          err instanceof Error ? err.message : 'An unexpected error occurred';
        setFlowState({ error: message, step: 'error' });
      }
    },
    [
      codeChallenge,
      codeChallengeMethod,
      desktopReturnTo,
      desktopState,
      getToken,
      hasPkce,
      isDesktopMode,
      port,
      user,
    ],
  );

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (isDesktopMode && !hasValidDesktopReturnTarget) {
      setFlowState({
        error:
          'Invalid desktop callback target. Restart sign-in from the Genfeed Desktop app.',
        step: 'error',
      });
      return;
    }

    if (!isDesktopMode && port === null) {
      setFlowState({
        error: portParam
          ? `Invalid port "${portParam}". Port must be a number between ${MIN_PORT} and ${MAX_PORT}.`
          : 'Missing port parameter. The CLI should open this page with a ?port= query parameter.',
        step: 'error',
      });
      return;
    }

    if (!isSignedIn) {
      setFlowState({ error: null, step: 'signing-in' });
      return;
    }

    if (!tokenRequestedRef.current) {
      tokenRequestedRef.current = true;
      const controller = new AbortController();
      requestTokenAndRedirect(controller.signal);

      return () => {
        controller.abort();
      };
    }
  }, [
    hasValidDesktopReturnTarget,
    isDesktopMode,
    isLoaded,
    isSignedIn,
    port,
    portParam,
    requestTokenAndRedirect,
  ]);

  const handleRetry = () => {
    tokenRequestedRef.current = false;
    setFlowState({ error: null, step: 'validating' });

    if (isDesktopMode || port !== null) {
      const controller = new AbortController();
      tokenRequestedRef.current = true;
      requestTokenAndRedirect(controller.signal);
    }
  };

  const handleCopyKey = async () => {
    if (flowState.apiKey) {
      await navigator.clipboard.writeText(flowState.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AuthFormLayout>
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-xl bg-white/5 border border-white/10 mb-5">
            <HiCommandLine className="size-5 text-white/60" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight mb-1.5">
            {isDesktopMode ? 'Desktop Authentication' : 'CLI Authentication'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isDesktopMode
              ? 'Authorize the Genfeed desktop app to access your account'
              : 'Authorize the Genfeed CLI to access your account'}
          </p>
        </div>

        <Card className="shadow-border border-transparent">
          <CardContent className="p-8">
            {(!isLoaded || flowState.step === 'validating') && (
              <StepDisplay
                icon={<Spinner size={ComponentSize.LG} />}
                title="Initializing"
                description="Setting up authentication..."
              />
            )}

            {isLoaded && flowState.step === 'signing-in' && (
              <div className="space-y-4">
                <StepDisplay
                  icon={
                    <HiCommandLine className="size-8 text-muted-foreground" />
                  }
                  title="Sign in required"
                  description="Sign in to authorize this device."
                />
                <Button asChild className="w-full" withWrapper={false}>
                  <Link href={loginHref}>Sign in to continue</Link>
                </Button>
              </div>
            )}

            {flowState.step === 'requesting-token' && (
              <div className="space-y-4">
                <StepDisplay
                  icon={<Spinner size={ComponentSize.LG} />}
                  title="Generating API key"
                  description={
                    isDesktopMode
                      ? 'Creating a secure API key for the desktop app...'
                      : 'Creating a secure API key for the CLI...'
                  }
                />
                {user?.primaryEmailAddress?.emailAddress && (
                  <div className="text-center">
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-muted-foreground">
                      Signed in as {user.primaryEmailAddress.emailAddress}
                    </span>
                  </div>
                )}
              </div>
            )}

            {flowState.step === 'redirecting' && (
              <div className="space-y-6">
                <StepDisplay
                  icon={<Spinner size={ComponentSize.LG} />}
                  title={
                    isDesktopMode
                      ? 'Redirecting to Desktop'
                      : 'Redirecting to CLI'
                  }
                  description={
                    isDesktopMode
                      ? 'Sending credentials back to the desktop app. You can close this tab shortly.'
                      : 'Sending credentials back to the CLI. You can close this tab shortly.'
                  }
                />
                {flowState.apiKey && (
                  <CopyKeyFallback
                    apiKey={flowState.apiKey}
                    copied={copied}
                    isDesktopMode={isDesktopMode}
                    onCopy={handleCopyKey}
                  />
                )}
              </div>
            )}

            {flowState.step === 'success' && (
              <div className="space-y-6">
                <StepDisplay
                  icon={<HiCheckCircle className="size-8 text-success" />}
                  title="Authentication complete"
                  description={
                    isDesktopMode
                      ? 'You can close this browser tab and return to the desktop app.'
                      : 'You can close this browser tab and return to the CLI.'
                  }
                />
                {flowState.apiKey && (
                  <CopyKeyFallback
                    apiKey={flowState.apiKey}
                    copied={copied}
                    isDesktopMode={isDesktopMode}
                    onCopy={handleCopyKey}
                  />
                )}
              </div>
            )}

            {flowState.step === 'error' && (
              <div className="space-y-6">
                <StepDisplay
                  icon={<HiXCircle className="size-8 text-destructive" />}
                  title="Authentication failed"
                  description={flowState.error || 'An unknown error occurred.'}
                />
                {flowState.apiKey && (
                  <CopyKeyFallback
                    apiKey={flowState.apiKey}
                    copied={copied}
                    isDesktopMode={isDesktopMode}
                    onCopy={handleCopyKey}
                  />
                )}
                {(isDesktopMode || port !== null) && (
                  <div className="flex justify-center">
                    <Button
                      variant={ButtonVariant.DEFAULT}
                      size={ButtonSize.DEFAULT}
                      onClick={handleRetry}
                    >
                      Try again
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-5 text-center text-[11px] text-muted-foreground/50 leading-relaxed">
          {isDesktopMode
            ? 'Desktop mode uses a server-minted API key and redirects back to the installed app.'
            : 'This page redirects credentials to 127.0.0.1 (localhost) only.'}
          {!isDesktopMode && (
            <>
              <br />
              No data is sent to external servers.
            </>
          )}
        </p>
      </div>
    </AuthFormLayout>
  );
}

function CopyKeyFallback({
  apiKey,
  copied,
  isDesktopMode,
  onCopy,
}: {
  apiKey: string;
  copied: boolean;
  isDesktopMode: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="border-t border-white/[0.08] pt-5 mt-2">
      <p className="text-xs text-muted-foreground text-center mb-3">
        If the {isDesktopMode ? 'desktop app' : 'CLI'} doesn&apos;t receive it
        automatically, copy and paste the key:
      </p>
      <div className="flex items-center gap-2">
        <Code
          display="block"
          size="sm"
          className="flex-1 border border-white/10 text-white/70 truncate select-all"
        >
          {apiKey}
        </Code>
        <Button
          variant={ButtonVariant.SOFT}
          size={ButtonSize.SM}
          onClick={onCopy}
        >
          {copied ? (
            <HiClipboardDocumentCheck className="size-4 text-success" />
          ) : (
            <HiClipboard className="size-4" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

function StepDisplay({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3">
      <div className="mb-1">{icon}</div>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        {description}
      </p>
    </div>
  );
}

export default function CliAuthPage() {
  return (
    <Suspense fallback={null}>
      <CliAuthPageContent />
    </Suspense>
  );
}
