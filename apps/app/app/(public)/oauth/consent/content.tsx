'use client';

import {
  API_KEY_SCOPE_OPTIONS,
  API_KEY_SCOPE_PRESETS,
} from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { EnvironmentService } from '@services/core/environment.service';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HiLockClosed } from 'react-icons/hi2';
import { Card, CardContent } from '@/components/ui/card';
import { redirectToOAuthClient } from './redirect';

type OAuthDecisionResponse = {
  error?: string;
  error_description?: string;
  redirectUrl?: string;
};

type ConsentState = {
  error: string | null;
  isSubmitting: boolean;
};

function getRequestedScopeLabels(scope: string | null): string[] {
  const requested = new Set(
    scope?.split(/\s+/).filter(Boolean) ?? API_KEY_SCOPE_PRESETS.mcp,
  );
  return API_KEY_SCOPE_OPTIONS.filter((option) =>
    option.scopes.some((candidate) => requested.has(candidate)),
  ).map((option) => option.label);
}

function getCallbackHost(redirectUri: string | null): string {
  if (!redirectUri) {
    return 'the requesting client';
  }
  try {
    const url = new URL(redirectUri);
    return url.host || url.protocol.replace(':', '');
  } catch {
    return 'the requesting client';
  }
}

export default function OAuthConsentContent() {
  const searchParams = useSearchParams();
  const { getToken, isLoaded, isSignedIn } = useAuthIdentity();
  const controllerRef = useRef<AbortController | null>(null);
  const [consentState, setConsentState] = useState<ConsentState>({
    error: null,
    isSubmitting: false,
  });

  const callbackPath = `/oauth/consent?${searchParams.toString()}`;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;
  const clientName = searchParams.get('client_name') || 'An MCP client';
  const redirectUri = searchParams.get('redirect_uri');
  const scopeLabels = useMemo(
    () => getRequestedScopeLabels(searchParams.get('scope')),
    [searchParams],
  );
  const requiredParams = [
    'client_id',
    'redirect_uri',
    'code_challenge',
    'code_challenge_method',
    'state',
    'resource',
  ];
  const hasRequiredParams = requiredParams.every((key) =>
    Boolean(searchParams.get(key)),
  );

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  async function submitDecision(approved: boolean): Promise<void> {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setConsentState({ error: null, isSubmitting: true });

    try {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        throw new Error('Your session expired. Sign in and try again.');
      }

      const response = await fetch(
        `${EnvironmentService.apiEndpoint}/oauth/authorize/decision`,
        {
          body: JSON.stringify({
            approved,
            client_id: searchParams.get('client_id'),
            code_challenge: searchParams.get('code_challenge'),
            code_challenge_method: searchParams.get('code_challenge_method'),
            redirect_uri: redirectUri,
            resource: searchParams.get('resource'),
            scope: searchParams.get('scope') || undefined,
            state: searchParams.get('state'),
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: controller.signal,
        },
      );
      const data = (await response.json()) as OAuthDecisionResponse;
      if (!response.ok || !data.redirectUrl) {
        throw new Error(
          data.error_description ||
            data.error ||
            'The authorization request could not be completed.',
        );
      }
      redirectToOAuthClient(data.redirectUrl);
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      setConsentState({
        error:
          error instanceof Error
            ? error.message
            : 'The authorization request could not be completed.',
        isSubmitting: false,
      });
    }
  }

  if (!isLoaded) {
    return <AuthFormLayout logoSize="compact">{null}</AuthFormLayout>;
  }

  return (
    <AuthFormLayout>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-5 inline-flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
            <HiLockClosed className="size-5 text-white/60" />
          </div>
          <h1 className="mb-1.5 text-xl font-semibold tracking-tight">
            Authorize Genfeed access
          </h1>
          <p className="text-sm text-muted-foreground">
            Review what this client can access before continuing.
          </p>
        </div>

        <Card className="border-transparent shadow-border">
          <CardContent className="space-y-6 p-8">
            {!hasRequiredParams ? (
              <div className="space-y-2 text-center">
                <h2 className="font-semibold">Invalid authorization request</h2>
                <p className="text-sm text-muted-foreground">
                  Required OAuth parameters are missing. Restart the connection
                  from your MCP client.
                </p>
              </div>
            ) : !isSignedIn ? (
              <div className="space-y-4 text-center">
                <div className="space-y-2">
                  <h2 className="font-semibold">Sign in required</h2>
                  <p className="text-sm text-muted-foreground">
                    Sign in to review and authorize this connection.
                  </p>
                </div>
                <Button asChild className="w-full" withWrapper={false}>
                  <Link href={loginHref}>Sign in to continue</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Requesting client
                  </p>
                  <h2 className="text-lg font-semibold">{clientName}</h2>
                  <p className="text-xs text-muted-foreground">
                    Returns to {getCallbackHost(redirectUri)}
                  </p>
                </div>

                <div className="space-y-3 border-y border-white/[0.08] py-5">
                  <p className="text-sm font-medium">Wants to access</p>
                  <div className="flex flex-wrap gap-2">
                    {scopeLabels.map((label) => (
                      <span
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground"
                        key={label}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                {consentState.error && (
                  <p className="text-sm text-destructive" role="alert">
                    {consentState.error}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    disabled={consentState.isSubmitting}
                    variant={ButtonVariant.SECONDARY}
                    onClick={() => submitDecision(false)}
                  >
                    Deny
                  </Button>
                  <Button
                    disabled={consentState.isSubmitting}
                    onClick={() => submitDecision(true)}
                  >
                    {consentState.isSubmitting ? 'Authorizing…' : 'Authorize'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground/50">
          Access is limited to the Genfeed MCP resource and can be revoked from
          API key settings.
        </p>
      </div>
    </AuthFormLayout>
  );
}
