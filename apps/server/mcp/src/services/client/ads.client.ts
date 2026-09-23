import type { BaseApiClient } from './base-api-client';
import type { AdsGatewayInsightsParams, ApiError } from './client.types';

type AdsListProvider = 'Meta' | 'Google Ads';
type AdsListErrorClass = 'auth' | 'internal' | 'provider';

const NOT_CONNECTED_DETAIL =
  /credential not found|not connected|not authori[sz]ed|please connect|connect your|missing credential|\bno credential\b|\bforbidden\b/i;

const AUTH_DETAIL =
  /\b(auth(?:entication|orization)?|oauth|invalid[_-]?grant|invalid token|token expired|unauthenticated)\b/i;

const GENERIC_DETAIL =
  /^(an unexpected error occurred|an error occurred|internal server error|http exception)$/i;

const UNSAFE_DETAIL =
  /<!doctype|<html\b|<body\b|<script\b|\bat\s+\S+\s+\(|node_modules/i;

/**
 * Missing Meta/Google credentials arrive as 401/403 or a connect/credential
 * detail. Other failures are labeled auth, provider, or internal. Only a short
 * sanitized API detail is appended — never tokens, HTML, or stack traces.
 */
function describeAdsListFailure(
  provider: AdsListProvider,
  fallback: string,
  error: ApiError,
): string {
  const status = readAdsHttpStatus(error);
  const detail = readSafeAdsDetail(error);

  if (isAdsNotConnected(status, detail)) {
    const message = `${provider} account is not connected or not authorized.`;
    return detail ? `${message} ${detail}` : message;
  }

  const errorClass = classifyAdsListError(status, detail);
  const classified = `${fallback} (${errorClass})`;
  return detail ? `${classified}: ${detail}` : classified;
}

function adsListOnError(
  provider: AdsListProvider,
  fallback: string,
): (error: ApiError) => never {
  return (error: ApiError) => {
    throw new Error(describeAdsListFailure(provider, fallback, error));
  };
}

function isAdsNotConnected(
  status: number | undefined,
  detail: string | undefined,
): boolean {
  if (status === 401 || status === 403) {
    return true;
  }

  return detail !== undefined && NOT_CONNECTED_DETAIL.test(detail);
}

function classifyAdsListError(
  status: number | undefined,
  detail: string | undefined,
): AdsListErrorClass {
  if (detail !== undefined && AUTH_DETAIL.test(detail)) {
    return 'auth';
  }

  // No HTTP status is a client/transport failure. A bare 500 is the API's
  // redacted unexpected error. Other statuses are the provider's response.
  if (status === undefined || (status === 500 && detail === undefined)) {
    return 'internal';
  }

  return 'provider';
}

function readAdsHttpStatus(error: ApiError): number | undefined {
  const httpStatus = error.response?.status;
  if (
    typeof httpStatus === 'number' &&
    httpStatus >= 400 &&
    httpStatus <= 599
  ) {
    return httpStatus;
  }

  const coded = error.response?.data?.errors?.[0]?.status;
  if (typeof coded === 'string' && /^[45]\d\d$/.test(coded)) {
    return Number(coded);
  }

  return undefined;
}

function readSafeAdsDetail(error: ApiError): string | undefined {
  const raw = firstAdsDetail(error);
  if (raw === undefined || UNSAFE_DETAIL.test(raw)) {
    return undefined;
  }

  const redacted = raw
    .replace(/\s+/g, ' ')
    .replace(/\b(Bearer|Basic)\s+\S+/gi, '$1 [redacted]')
    .replace(
      /\b((?:access[_-]?token|api[_-]?key|refresh[_-]?token|client[_-]?secret|password|secret)\s*[:=]\s*)\S+/gi,
      '$1[redacted]',
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[redacted]',
    )
    .trim();

  if (
    !redacted ||
    redacted.length > 240 ||
    GENERIC_DETAIL.test(redacted) ||
    UNSAFE_DETAIL.test(redacted)
  ) {
    return undefined;
  }

  return redacted;
}

function firstAdsDetail(error: ApiError): string | undefined {
  const data = error.response?.data;
  const candidates = [data?.errors?.[0]?.detail, data?.message, data?.error];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

/**
 * Meta Ads, Google Ads, and TikTok Ads read methods, plus the platform-generic
 * ads gateway.
 *
 * Meta/Google paths target the API's `services/*-ads/*` controllers (not
 * `integrations/*`). Those controllers live at
 * `apps/server/api/src/services/integrations/{meta,google}-ads` but are mounted
 * under `@Controller('services/meta-ads')` / `@Controller('services/google-ads')`,
 * so the proxy path segment is `services`.
 *
 * TikTok has no per-platform controller. It is served by the platform-generic
 * ads gateway at `@Controller('ads')` → `/ads/:platform/*`, which already
 * accepts `tiktok` and dispatches to `TikTokAdsAdapter`. Reusing the gateway
 * keeps one adapter contract instead of a second TikTok REST surface.
 *
 * Ad-set and ad level insights go through the gateway at `@Controller('ads')`
 * → `/ads/:platform/*` instead, because that surface is backed by the shared
 * `IAdsAdapter` contract and therefore works for every supported platform
 * rather than only the two with dedicated controllers.
 */
export class AdsClient {
  constructor(private readonly base: BaseApiClient) {}

  // ── Meta Ads ──

  listMetaAdAccounts(): Promise<unknown[]> {
    return this.base.request(
      'listing Meta ad accounts',
      async (http) =>
        this.base.unwrapList(await http.get('/services/meta-ads/accounts')),
      adsListOnError('Meta', 'Failed to list Meta ad accounts'),
    );
  }

  listMetaCampaigns(
    adAccountId: string,
    status?: string,
    limit?: number,
  ): Promise<unknown[]> {
    return this.base.request(
      'listing Meta campaigns',
      async (http) =>
        this.base.unwrapList(
          await http.get('/services/meta-ads/campaigns', {
            params: { adAccountId, limit, status },
          }),
        ),
      this.base.failWith('Failed to list Meta campaigns'),
    );
  }

  getMetaCampaignInsights(
    campaignId: string,
    datePreset?: string,
    since?: string,
    until?: string,
  ): Promise<unknown> {
    return this.base.request(
      'getting Meta campaign insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(
            `/services/meta-ads/campaigns/${campaignId}/insights`,
            { params: { datePreset, since, until } },
          ),
        ),
      this.base.failWith('Failed to get Meta campaign insights'),
    );
  }

  getMetaAdSetInsights(adSetId: string, datePreset?: string): Promise<unknown> {
    return this.base.request(
      'getting Meta ad set insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(`/services/meta-ads/adsets/${adSetId}/insights`, {
            params: { datePreset },
          }),
        ),
      this.base.failWith('Failed to get Meta ad set insights'),
    );
  }

  getMetaAdInsights(adId: string, datePreset?: string): Promise<unknown> {
    return this.base.request(
      'getting Meta ad insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(`/services/meta-ads/ads/${adId}/insights`, {
            params: { datePreset },
          }),
        ),
      this.base.failWith('Failed to get Meta ad insights'),
    );
  }

  listMetaAdCreatives(adAccountId: string, limit?: number): Promise<unknown[]> {
    return this.base.request(
      'listing Meta ad creatives',
      async (http) =>
        this.base.unwrapList(
          await http.get('/services/meta-ads/creatives', {
            params: { adAccountId, limit },
          }),
        ),
      this.base.failWith('Failed to list Meta ad creatives'),
    );
  }

  compareMetaCampaigns(
    campaignIds: string[],
    datePreset?: string,
  ): Promise<unknown> {
    return this.base.request(
      'comparing Meta campaigns',
      async (http) =>
        this.base.unwrapData(
          await http.get('/services/meta-ads/campaigns/compare', {
            params: { campaignIds: campaignIds.join(','), datePreset },
          }),
        ),
      this.base.failWith('Failed to compare Meta campaigns'),
    );
  }

  getMetaTopPerformers(
    adAccountId: string,
    metric: string,
    limit?: number,
  ): Promise<unknown[]> {
    return this.base.request(
      'getting Meta top performers',
      async (http) =>
        this.base.unwrapList(
          await http.get('/services/meta-ads/top-performers', {
            params: { adAccountId, limit, metric },
          }),
        ),
      this.base.failWith('Failed to get Meta top performers'),
    );
  }

  // ── Google Ads ──

  listGoogleAdsCustomers(): Promise<unknown[]> {
    return this.base.request(
      'listing Google Ads customers',
      async (http) =>
        this.base.unwrapList(await http.get('/services/google-ads/customers')),
      adsListOnError('Google Ads', 'Failed to list Google Ads customers'),
    );
  }

  listGoogleAdsCampaigns(
    customerId: string,
    status?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    return this.base.request(
      'listing Google Ads campaigns',
      async (http) =>
        this.base.unwrapList(
          await http.get('/services/google-ads/campaigns', {
            params: { customerId, limit, loginCustomerId, status },
          }),
        ),
      this.base.failWith('Failed to list Google Ads campaigns'),
    );
  }

  getGoogleAdsCampaignMetrics(
    customerId: string,
    campaignId: string,
    startDate?: string,
    endDate?: string,
    segmentByDate?: boolean,
    loginCustomerId?: string,
  ): Promise<unknown> {
    return this.base.request(
      'getting Google Ads campaign metrics',
      async (http) =>
        this.base.unwrapData(
          await http.get(
            `/services/google-ads/campaigns/${campaignId}/metrics`,
            {
              params: {
                customerId,
                endDate,
                loginCustomerId,
                segmentByDate,
                startDate,
              },
            },
          ),
        ),
      this.base.failWith('Failed to get Google Ads campaign metrics'),
    );
  }

  getGoogleAdsAdGroupInsights(
    customerId: string,
    adGroupId: string,
    startDate?: string,
    endDate?: string,
    loginCustomerId?: string,
  ): Promise<unknown> {
    return this.base.request(
      'getting Google Ads ad group insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(
            `/services/google-ads/ad-groups/${adGroupId}/insights`,
            {
              params: { customerId, endDate, loginCustomerId, startDate },
            },
          ),
        ),
      this.base.failWith('Failed to get Google Ads ad group insights'),
    );
  }

  getGoogleAdsKeywordPerformance(
    customerId: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    return this.base.request(
      'getting Google Ads keyword performance',
      async (http) =>
        this.base.unwrapList(
          await http.get('/services/google-ads/keywords', {
            params: { customerId, endDate, limit, loginCustomerId, startDate },
          }),
        ),
      this.base.failWith('Failed to get Google Ads keyword performance'),
    );
  }

  getGoogleAdsSearchTerms(
    customerId: string,
    campaignId: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
    loginCustomerId?: string,
  ): Promise<unknown[]> {
    return this.base.request(
      'getting Google Ads search terms',
      async (http) =>
        this.base.unwrapList(
          await http.get(`/services/google-ads/search-terms/${campaignId}`, {
            params: {
              customerId,
              endDate,
              limit,
              loginCustomerId,
              startDate,
            },
          }),
        ),
      this.base.failWith('Failed to get Google Ads search terms'),
    );
  }

  // ── TikTok Ads (platform-generic ads gateway) ──

  listTikTokAdAccounts(credentialId: string): Promise<unknown[]> {
    return this.base.request(
      'listing TikTok ad accounts',
      async (http) =>
        this.base.unwrapList(
          await http.get('/ads/tiktok/accounts', { params: { credentialId } }),
        ),
      this.base.failWith('Failed to list TikTok ad accounts'),
    );
  }

  listTikTokCampaigns(
    credentialId: string,
    adAccountId: string,
  ): Promise<unknown[]> {
    return this.base.request(
      'listing TikTok campaigns',
      async (http) =>
        this.base.unwrapList(
          await http.get('/ads/tiktok/campaigns', {
            params: { adAccountId, credentialId },
          }),
        ),
      this.base.failWith('Failed to list TikTok campaigns'),
    );
  }

  getTikTokCampaignInsights(
    credentialId: string,
    adAccountId: string,
    campaignId: string,
    datePreset?: string,
    since?: string,
    until?: string,
  ): Promise<unknown> {
    return this.base.request(
      'getting TikTok campaign insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(`/ads/tiktok/campaigns/${campaignId}/insights`, {
            params: { adAccountId, credentialId, datePreset, since, until },
          }),
        ),
      this.base.failWith('Failed to get TikTok campaign insights'),
    );
  }

  getTikTokTopPerformers(
    credentialId: string,
    adAccountId: string,
    metric?: string,
    limit?: number,
    datePreset?: string,
  ): Promise<unknown[]> {
    return this.base.request(
      'getting TikTok top performers',
      async (http) =>
        this.base.unwrapList(
          await http.get('/ads/tiktok/top-performers', {
            params: { adAccountId, credentialId, datePreset, limit, metric },
          }),
        ),
      this.base.failWith('Failed to get TikTok top performers'),
    );
  }

  listTikTokAdGroups(
    credentialId: string,
    adAccountId: string,
    campaignId: string,
  ): Promise<unknown[]> {
    return this.base.request(
      'listing TikTok ad groups',
      async (http) =>
        this.base.unwrapList(
          await http.get('/ads/tiktok/adsets', {
            params: { adAccountId, campaignId, credentialId },
          }),
        ),
      this.base.failWith('Failed to list TikTok ad groups'),
    );
  }

  listTikTokAds(
    credentialId: string,
    adAccountId: string,
    adGroupId?: string,
  ): Promise<unknown[]> {
    return this.base.request(
      'listing TikTok ads',
      async (http) =>
        this.base.unwrapList(
          await http.get('/ads/tiktok/ads', {
            params: { adAccountId, adSetId: adGroupId, credentialId },
          }),
        ),
      this.base.failWith('Failed to list TikTok ads'),
    );
  }

  // ── Ads gateway (platform-generic, `/ads/:platform/*`) ──

  getAdsAdSetInsights(params: AdsGatewayInsightsParams): Promise<unknown> {
    return this.base.request(
      'getting ad set insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(
            `/ads/${params.platform}/adsets/${params.entityId}/insights`,
            { params: this.toGatewayQuery(params) },
          ),
        ),
      this.base.failWith('Failed to get ad set insights'),
    );
  }

  getAdsAdInsights(params: AdsGatewayInsightsParams): Promise<unknown> {
    return this.base.request(
      'getting ad insights',
      async (http) =>
        this.base.unwrapData(
          await http.get(
            `/ads/${params.platform}/ads/${params.entityId}/insights`,
            { params: this.toGatewayQuery(params) },
          ),
        ),
      this.base.failWith('Failed to get ad insights'),
    );
  }

  private toGatewayQuery(
    params: AdsGatewayInsightsParams,
  ): Record<string, string | undefined> {
    return {
      adAccountId: params.adAccountId,
      credentialId: params.credentialId,
      datePreset: params.datePreset,
      loginCustomerId: params.loginCustomerId,
      since: params.since,
      until: params.until,
    };
  }
}
