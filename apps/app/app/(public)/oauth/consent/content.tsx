'use client';

import LoginBetterAuth from '@app/(public)/login/login-better-auth';
import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import {
  API_KEY_SCOPE_OPTIONS,
  API_KEY_SCOPE_PRESETS,
} from '@genfeedai/contracts/constants';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import type {
  ConsentState,
  OAuthDecisionResponse,
} from '@props/auth/oauth-consent-content.props';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import { ArrowUpRight, Lock } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { redirectToOAuthClient } from './redirect';

function getRequestedScopeLabels(scope: string | null): string[] {
  const requested = new Set(
    scope?.split(/\s+/).filter(Boolean) ?? API_KEY_SCOPE_PRESETS.mcp,
  );
  return API_KEY_SCOPE_OPTIONS.filter((option) =>
    option.scopes.some((candidate) => requested.has(candidate)),
  ).map((option) => option.label);
}

function getCallbackHost(
  redirectUri: string | null,
  unknownClientLabel: string,
): string {
  if (!redirectUri) {
    return unknownClientLabel;
  }
  try {
    const url = new URL(redirectUri);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.host;
    }
    // Native-app schemes (`cursor://anysphere.cursor-mcp`) identify the
    // receiving app by the scheme, so show it alongside the host.
    return url.host ? `${url.protocol}//${url.host}` : url.protocol;
  } catch {
    return unknownClientLabel;
  }
}

export default function OAuthConsentContent() {
  const translate = useTranslations('common.oauth.consent');
  const searchParams = useSearchParams();
  const { getToken, isLoaded, isSignedIn } = useAuthIdentity();
  const controllerRef = useRef<AbortController | null>(null);
  const [consentState, setConsentState] = useState<ConsentState>({
    error: null,
    isSubmitting: false,
    result: null,
  });

  const callbackPath = `/oauth/consent?${searchParams.toString()}`;
  const clientName =
    searchParams.get('client_name') || translate('clientName.fallback');
  const redirectUri = searchParams.get('redirect_uri');
  const scopeLabels = useMemo(
    () => getRequestedScopeLabels(searchParams.get('scope')),
    [searchParams],
  );
  // `state` is optional (RFC 6749 §4.1.1); PKCE is the CSRF protection.
  const requiredParams = [
    'client_id',
    'redirect_uri',
    'code_challenge',
    'code_challenge_method',
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

  // Returning from a native app via the back/forward cache restores this page
  // frozen in its last state; unlock it so the request can be reviewed again.
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent): void {
      if (event.persisted) {
        setConsentState({ error: null, isSubmitting: false, result: null });
      }
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  async function submitDecision(approved: boolean): Promise<void> {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setConsentState({ error: null, isSubmitting: true, result: null });

    try {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        throw new Error(translate('errors.sessionExpired'));
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
            // Forwarded unchanged when the client supplied one; omitted otherwise.
            state: searchParams.get('state') || undefined,
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
            translate('errors.decisionFailed'),
        );
      }
      setConsentState({
        error: null,
        isSubmitting: false,
        result: {
          decision: approved ? 'approved' : 'denied',
          redirectUrl: data.redirectUrl,
        },
      });
      redirectToOAuthClient(data.redirectUrl);
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      setConsentState({
        error:
          error instanceof Error
            ? error.message
            : translate('errors.decisionFailed'),
        isSubmitting: false,
        result: null,
      });
    }
  }

  if (!isLoaded) {
    return <AuthFormLayout logoSize="compact">{null}</AuthFormLayout>;
  }

  // Someone without a session signs in or signs up right here, with every
  // login option. Each path lands back on this card, so a new account skips
  // the web onboarding and the user still approves access once (#6268).
  if (hasRequiredParams && !isSignedIn) {
    return (
      <LoginBetterAuth
        callbackURL={callbackPath}
        description={translate('signIn.description')}
        title={translate('signIn.title', { clientName })}
      />
    );
  }

  const { result } = consentState;

  return (
    <AuthFormLayout
      description={translate('description')}
      logoSize="compact"
      title={translate('title')}
    >
      <div className="space-y-6">
        {!hasRequiredParams ? (
          <div className="space-y-2">
            <h2 className="font-semibold">{translate('invalid.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {translate('invalid.description')}
            </p>
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <h2 className="font-semibold">
                {result.decision === 'approved'
                  ? translate('result.approvedTitle')
                  : translate('result.deniedTitle')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {translate('result.description', { clientName })}
              </p>
            </div>
            <Button asChild className="w-full" withWrapper={false}>
              <a href={result.redirectUrl}>
                {translate('result.returnAction', { clientName })}
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </div>
        ) : (
          <>
            <Card
              bodyClassName="flex-row items-start gap-3 p-4"
              variant={CardVariant.BORDERED}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                <Lock className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                  {translate('request.clientLabel')}
                </p>
                <h2 className="truncate text-base font-semibold">
                  {clientName}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {translate('request.returnsTo', {
                    host: getCallbackHost(
                      redirectUri,
                      translate('callbackHost.unknownClient'),
                    ),
                  })}
                </p>
              </div>
            </Card>

            <div className="space-y-3">
              <p className="text-sm font-medium">
                {translate('request.scopesLabel')}
              </p>
              <div className="flex flex-wrap gap-2">
                {scopeLabels.map((label) => (
                  <span
                    className="rounded-full border border-border bg-background-tertiary px-3 py-1 text-xs text-muted-foreground"
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
                className="w-full"
                disabled={consentState.isSubmitting}
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
                onClick={() => submitDecision(false)}
              >
                {translate('request.actions.deny')}
              </Button>
              <Button
                className="w-full"
                disabled={consentState.isSubmitting}
                withWrapper={false}
                onClick={() => submitDecision(true)}
              >
                {consentState.isSubmitting
                  ? translate('request.actions.authorizing')
                  : translate('request.actions.authorize')}
              </Button>
            </div>
          </>
        )}

        <p className="text-center text-2xs leading-relaxed text-muted-foreground/60">
          {translate('footer')}
        </p>
      </div>
    </AuthFormLayout>
  );
}
