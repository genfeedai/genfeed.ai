'use client';

import LoginBetterAuth from '@app/(public)/login/login-better-auth';
import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import {
  API_KEY_SCOPE_OPTIONS,
  API_KEY_SCOPE_PRESETS,
  MCP_CLAUDE_SCOPE_CEILING,
} from '@genfeedai/contracts/constants';
import { resolveMcpAccessModeForResource } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import type {
  ConsentState,
  OAuthDecisionResponse,
} from '@props/auth/oauth-consent-content.props';
import { EnvironmentService } from '@services/core/environment.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import { SelectField } from '@ui/primitives/select';
import { ArrowUpRight, Check, Lock } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { redirectToOAuthClient } from './redirect';

type AccessLevel = 'full' | 'drafts' | 'read';

/** Scopes that let a client schedule or publish, dropped by the drafts level. */
const PUBLISHING_SCOPES: readonly string[] = [
  'posts:schedule',
  'posts:approve',
  'posts:publish',
];

function getRequestedScopes(scope: string | null, isClaude: boolean): string[] {
  const ceiling: readonly string[] = isClaude
    ? MCP_CLAUDE_SCOPE_CEILING
    : API_KEY_SCOPE_PRESETS.mcp;
  return (scope?.split(/\s+/).filter(Boolean) ?? [...ceiling]).filter(
    (candidate) => ceiling.includes(candidate),
  );
}

/**
 * The access levels a user can pick, narrowest last. A level is offered only
 * when it differs from the one above it, so a client that already asks for
 * read-only access gets no dropdown choice to make.
 */
function getAccessLevels(requested: string[]): Record<AccessLevel, string[]> {
  const drafts = requested.filter(
    (scope) => !PUBLISHING_SCOPES.includes(scope),
  );
  const read = requested.filter((scope) => scope.endsWith(':read'));
  return { drafts, full: requested, read };
}

function getAvailableAccessLevels(
  levels: Record<AccessLevel, string[]>,
): AccessLevel[] {
  const available: AccessLevel[] = ['full'];
  if (levels.drafts.length > 0 && levels.drafts.length < levels.full.length) {
    available.push('drafts');
  }
  const widest = available.includes('drafts') ? levels.drafts : levels.full;
  if (levels.read.length > 0 && levels.read.length < widest.length) {
    available.push('read');
  }
  return available;
}

function getScopeLabels(scopes: string[]): string[] {
  const granted = new Set(scopes);
  return API_KEY_SCOPE_OPTIONS.filter((option) =>
    option.scopes.some((candidate) => granted.has(candidate)),
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
  const translateOrganization = useTranslations(
    'common.oauth.consent.organization',
  );
  const searchParams = useSearchParams();
  const { getToken, isLoaded, isSignedIn } = useAuthIdentity();
  const controllerRef = useRef<AbortController | null>(null);
  const [consentState, setConsentState] = useState<ConsentState>({
    error: null,
    isSubmitting: false,
    result: null,
  });

  const [organizations, setOrganizations] = useState<
    Awaited<ReturnType<OrganizationsService['getMyOrganizations']>>
  >([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [isLoadingOrganizations, setIsLoadingOrganizations] = useState(true);
  const [organizationError, setOrganizationError] = useState<string | null>(
    null,
  );

  const callbackPath = `/oauth/consent?${searchParams.toString()}`;
  const clientName =
    searchParams.get('client_name') || translate('clientName.fallback');
  const redirectUri = searchParams.get('redirect_uri');
  const requestedResource = searchParams.get('resource');
  const isClaude =
    Boolean(requestedResource) &&
    resolveMcpAccessModeForResource(requestedResource ?? '') === 'claude';
  const requestedScope = searchParams.get('scope') || null;
  const requestedScopes = useMemo(
    () => getRequestedScopes(requestedScope, isClaude),
    [requestedScope, isClaude],
  );
  const accessLevels = useMemo(
    () => getAccessLevels(requestedScopes),
    [requestedScopes],
  );
  const availableAccessLevels = useMemo(
    () => getAvailableAccessLevels(accessLevels),
    [accessLevels],
  );
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('full');
  const scopeLabels = useMemo(
    () => getScopeLabels(accessLevels[accessLevel]),
    [accessLevels, accessLevel],
  );
  // Only the full request carries an org owner's admin standing (the server
  // adds it for a full preset grant), so a narrower level never shows it.
  const showAdminNotice =
    !isClaude &&
    accessLevel === 'full' &&
    API_KEY_SCOPE_PRESETS.mcp.every((scope) => requestedScopes.includes(scope));
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

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasRequiredParams) {
      return;
    }
    const controller = new AbortController();
    setIsLoadingOrganizations(true);
    setSelectedOrganizationId('');
    setOrganizations([]);
    setOrganizationError(null);

    async function loadOrganizations(): Promise<void> {
      try {
        const token = await resolveAuthToken(getToken);
        if (!token) {
          throw new Error(translate('errors.sessionExpired'));
        }
        const available =
          await OrganizationsService.getInstance(token).getMyOrganizations();
        if (controller.signal.aborted) {
          return;
        }
        setOrganizations(available);
        setSelectedOrganizationId(
          available.length === 1 ? available[0].id : '',
        );
        if (!available.length) {
          setOrganizationError(translateOrganization('empty'));
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setOrganizationError(
            error instanceof Error
              ? error.message
              : translateOrganization('error'),
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingOrganizations(false);
        }
      }
    }
    void loadOrganizations();
    return () => controller.abort();
  }, [
    getToken,
    hasRequiredParams,
    isLoaded,
    isSignedIn,
    translate,
    translateOrganization,
  ]);

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
    if (
      approved &&
      (isLoadingOrganizations ||
        !organizations.some(
          (organization) => organization.id === selectedOrganizationId,
        ))
    ) {
      return;
    }
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
            organizationId: approved ? selectedOrganizationId : undefined,
            redirect_uri: redirectUri,
            resource: searchParams.get('resource'),
            // Untouched, send the client's own request; a narrower level sends
            // exactly the scopes it keeps.
            scope:
              accessLevel === 'full'
                ? requestedScope || undefined
                : accessLevels[accessLevel].join(' '),
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
      isWide
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
            <div className="grid gap-8 md:grid-cols-2">
              <div className="space-y-6">
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

                {isLoadingOrganizations ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {translateOrganization('loading')}
                  </p>
                ) : organizationError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {organizationError}
                  </p>
                ) : organizations.length === 1 ? (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">
                      {translateOrganization('label')}
                    </p>
                    <p className="text-sm">{organizations[0].label}</p>
                  </div>
                ) : (
                  <SelectField
                    isDisabled={consentState.isSubmitting}
                    label={translateOrganization('label')}
                    name="consent-organization"
                    placeholder={translateOrganization('placeholder')}
                    value={selectedOrganizationId || undefined}
                    onChange={(event) =>
                      setSelectedOrganizationId(event.target.value)
                    }
                  >
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.label}
                      </option>
                    ))}
                  </SelectField>
                )}

                {availableAccessLevels.length > 1 && (
                  <SelectField
                    isDisabled={consentState.isSubmitting}
                    label={translate('access.label')}
                    name="consent-access-level"
                    value={accessLevel}
                    onChange={(event) =>
                      setAccessLevel(event.target.value as AccessLevel)
                    }
                  >
                    {availableAccessLevels.map((level) => (
                      <option key={level} value={level}>
                        {translate(`access.levels.${level}`)}
                      </option>
                    ))}
                  </SelectField>
                )}
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    {translate('request.scopesLabel')}
                  </p>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {scopeLabels.map((label) => (
                      <li
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                        key={label}
                      >
                        <Check
                          aria-hidden="true"
                          className="size-4 shrink-0 text-foreground"
                        />
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>

                {isClaude && (
                  <p className="text-sm text-muted-foreground">
                    {translate('request.claudeNotice')}
                  </p>
                )}

                {showAdminNotice && (
                  <p className="text-sm text-muted-foreground">
                    {translate('request.adminNotice')}
                  </p>
                )}
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
                disabled={
                  consentState.isSubmitting ||
                  isLoadingOrganizations ||
                  !selectedOrganizationId
                }
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
