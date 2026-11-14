'use client';

import LoginBetterAuth from '@app/(public)/login/login-better-auth';
import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import {
  API_KEY_SCOPE_PRESETS,
  APP_ROUTES,
  createOrganizationAppRoute,
  MCP_CLAUDE_SCOPE_CEILING,
} from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { resolveMcpAccessModeForResource } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { EnvironmentService } from '@services/core/environment.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { SelectField } from '@ui/primitives/select';
import {
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarClock,
  type Check,
  Coins,
  Image as ImageIcon,
  Lock,
  MessageSquareText,
  Newspaper,
  Palette,
  PenLine,
  Sparkles,
  TrendingUp,
  Video,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import AuthFormLayout from '@/components/layouts/auth/AuthFormLayout';
import type {
  ConsentState,
  OAuthDecisionResponse,
} from '@/features/auth/props/oauth-consent-content.props';
import { redirectToOAuthClient } from './redirect';

const WHITESPACE_RUN_PATTERN = /\s+/;

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
  return (
    scope?.split(WHITESPACE_RUN_PATTERN).filter(Boolean) ?? [...ceiling]
  ).filter((candidate) => ceiling.includes(candidate));
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

type ConsentTileKey =
  | 'analytics'
  | 'articles'
  | 'brands'
  | 'credits'
  | 'drafts'
  | 'images'
  | 'prompts'
  | 'publishing'
  | 'scheduling'
  | 'trends'
  | 'videos';

/** One tile per capability; it is on when any of its scopes is granted. */
const CONSENT_TILES: {
  icon: typeof Check;
  isCreation?: boolean;
  key: ConsentTileKey;
  scopes: string[];
}[] = [
  {
    icon: Video,
    isCreation: true,
    key: 'videos',
    scopes: ['videos:read', 'videos:create'],
  },
  {
    icon: ImageIcon,
    isCreation: true,
    key: 'images',
    scopes: ['images:read', 'images:create'],
  },
  {
    icon: MessageSquareText,
    isCreation: true,
    key: 'prompts',
    scopes: ['prompts:read', 'prompts:create'],
  },
  {
    icon: Newspaper,
    key: 'articles',
    scopes: ['articles:read', 'articles:create'],
  },
  { icon: PenLine, key: 'drafts', scopes: ['posts:draft'] },
  { icon: CalendarClock, key: 'scheduling', scopes: ['posts:schedule'] },
  {
    icon: BadgeCheck,
    key: 'publishing',
    scopes: ['posts:approve', 'posts:publish'],
  },
  { icon: Palette, key: 'brands', scopes: ['brands:read'] },
  { icon: Coins, key: 'credits', scopes: ['credits:read'] },
  { icon: BarChart3, key: 'analytics', scopes: ['analytics:read'] },
  { icon: TrendingUp, key: 'trends', scopes: ['analytics:read'] },
];

/**
 * Every tile always shows, so the card keeps one size: a tile the chosen
 * access level or client does not grant is greyed out instead of removed.
 */
function getScopeTiles(
  scopes: string[],
  isClaude: boolean,
): { icon: typeof Check; isDisabled: boolean; key: ConsentTileKey }[] {
  const granted = new Set(scopes);
  return CONSENT_TILES.map((tile) => ({
    icon: tile.icon,
    isDisabled:
      (isClaude && tile.isCreation === true) ||
      !tile.scopes.some((candidate) => granted.has(candidate)),
    key: tile.key,
  }));
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

/** Dropdown value for a connection that may act in every organization. */
const ALL_ORGANIZATIONS = 'all';

/** Official marks of the clients we know, vendored from their first-party sites. */
const CLIENT_LOGOS: readonly { pattern: RegExp; src: string }[] = [
  { pattern: /claude/i, src: '/assets/agent-logos/claude.svg' },
  { pattern: /codex|openai|chatgpt/i, src: '/assets/agent-logos/openai.svg' },
  { pattern: /cursor/i, src: '/assets/agent-logos/cursor.svg' },
];

function getClientLogo(clientName: string): string | null {
  return (
    CLIENT_LOGOS.find(({ pattern }) => pattern.test(clientName))?.src ?? null
  );
}

export default function OAuthConsentContent() {
  const translate = useTranslations('common.oauth.consent');
  const translateOrganization = useTranslations(
    'common.oauth.consent.organization',
  );
  const translateBrand = useTranslations('common.oauth.consent.brand');
  const translateTiles = useTranslations('common.oauth.consent.request.tiles');
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
  const [brands, setBrands] = useState<{ id: string; label: string }[]>([]);
  // Empty = every brand in the organization; a picked brand limits the
  // connection to that one brand.
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);
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
  const isAdmin =
    Boolean(requestedResource) &&
    resolveMcpAccessModeForResource(requestedResource ?? '') === 'admin';
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
  const scopeTiles = useMemo(
    () => getScopeTiles(accessLevels[accessLevel], isClaude),
    [accessLevels, accessLevel, isClaude],
  );
  // Only the staff admin endpoint carries admin standing; the server refuses
  // consent there to everyone else, so the notice is not shown elsewhere.
  const showAdminNotice = isAdmin;
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
          available.length > 1 ? ALL_ORGANIZATIONS : (available[0]?.id ?? ''),
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

  // Offer the selected organization's brands. The choice starts on "All
  // brands"; picking one limits the connection to it.
  useEffect(() => {
    if (
      !selectedOrganizationId ||
      selectedOrganizationId === ALL_ORGANIZATIONS
    ) {
      setBrands([]);
      setSelectedBrandId('');
      return;
    }
    const controller = new AbortController();
    setIsLoadingBrands(true);
    setBrands([]);
    setSelectedBrandId('');

    async function loadBrands(): Promise<void> {
      try {
        const token = await resolveAuthToken(getToken);
        if (!token) {
          return;
        }
        const available = await OrganizationsService.getInstance(
          token,
        ).findOrganizationBrands(selectedOrganizationId);
        if (controller.signal.aborted) {
          return;
        }
        setBrands(
          available.map((brand) => ({ id: brand.id, label: brand.label })),
        );
      } catch {
        // No brand list: stay on "All brands".
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingBrands(false);
        }
      }
    }
    void loadBrands();
    return () => controller.abort();
  }, [getToken, selectedOrganizationId]);

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

  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId);

  // "All" needs a second organization and a tool set that can use it.
  const canChooseAllOrganizations = organizations.length > 1;
  const isAllOrganizations =
    canChooseAllOrganizations && selectedOrganizationId === ALL_ORGANIZATIONS;
  const defaultOrganization = organizations[0];

  async function submitDecision(approved: boolean): Promise<void> {
    if (
      approved &&
      (isLoadingOrganizations ||
        (!isAllOrganizations &&
          !organizations.some(
            (organization) => organization.id === selectedOrganizationId,
          )))
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
            allowOrganizationSwitching:
              approved && isAllOrganizations ? true : undefined,
            approved,
            brandId:
              approved && !isAllOrganizations && selectedBrandId
                ? selectedBrandId
                : undefined,
            client_id: searchParams.get('client_id'),
            code_challenge: searchParams.get('code_challenge'),
            code_challenge_method: searchParams.get('code_challenge_method'),
            // All organizations starts in the first one listed, the one the
            // screen names, so the connection and the screen agree.
            organizationId: approved
              ? isAllOrganizations
                ? defaultOrganization?.id
                : selectedOrganizationId
              : undefined,
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
                  bodyClassName="flex-row items-start"
                  variant={CardVariant.BORDERED}
                >
                  <div
                    className={
                      'flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-white [color-scheme:light]' /* design-system-allow-content-color -- vendor marks are drawn for a light tile */
                    }
                  >
                    {getClientLogo(clientName) ? (
                      <Image
                        alt=""
                        className="size-5 object-contain [color-scheme:light]"
                        height={20}
                        src={getClientLogo(clientName) ?? ''}
                        unoptimized
                        width={20}
                      />
                    ) : (
                      <Lock className="size-4 text-muted-foreground" />
                    )}
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
                    isTextCaseKept
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
                    {canChooseAllOrganizations && (
                      <option value={ALL_ORGANIZATIONS}>
                        {translateOrganization('all.label')}
                      </option>
                    )}
                  </SelectField>
                )}

                <div className="space-y-1.5">
                  <SelectField
                    isDisabled={
                      consentState.isSubmitting ||
                      isLoadingBrands ||
                      !selectedOrganizationId ||
                      isAllOrganizations
                    }
                    isTextCaseKept
                    label={translateBrand('label')}
                    name="consent-brand"
                    value={selectedBrandId}
                    onChange={(event) => setSelectedBrandId(event.target.value)}
                  >
                    <option value="">{translateBrand('allBrands')}</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.label}
                      </option>
                    ))}
                  </SelectField>
                </div>

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
                    {translate('request.scopesLabel', { clientName })}
                  </p>
                  <ul className="grid grid-cols-3 gap-2">
                    {scopeTiles.map(({ icon: Icon, isDisabled, key }) => (
                      <li
                        aria-disabled={isDisabled || undefined}
                        className={cn(
                          'flex flex-col items-start gap-1.5 rounded-lg border border-border bg-card p-2.5 text-sm',
                          isDisabled && 'opacity-40',
                        )}
                        key={key}
                      >
                        <span
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-md',
                            isDisabled
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-primary/10 text-primary',
                          )}
                        >
                          <Icon aria-hidden="true" className="size-3.5" />
                        </span>
                        {translateTiles(key)}
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 aria-hidden="true" className="size-4 shrink-0" />
                  {isAllOrganizations
                    ? translateOrganization('all.description', {
                        count: organizations.length,
                        organization: organizations[0]?.label ?? '',
                      })
                    : selectedBrand
                      ? translateBrand('onlyBrandDescription', {
                          brand: selectedBrand.label,
                          organization:
                            organizations.find(
                              (organization) =>
                                organization.id === selectedOrganizationId,
                            )?.label ?? '',
                        })
                      : translateBrand('allBrandsDescription', {
                          organization:
                            organizations.find(
                              (organization) =>
                                organization.id === selectedOrganizationId,
                            )?.label ?? '',
                        })}
                </p>

                {isClaude && defaultOrganization && (
                  <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Sparkles aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      {translate('request.mediaInvite')}
                    </span>
                    <Button
                      asChild
                      variant={ButtonVariant.SECONDARY}
                      withWrapper={false}
                    >
                      <Link
                        href={createOrganizationAppRoute(
                          defaultOrganization.slug,
                          APP_ROUTES.CONNECTORS.AGENTS,
                        )}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {translate('request.mediaInviteAction')}
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
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
