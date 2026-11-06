import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { GoogleSearchConsoleService } from '@api/services/integrations/google-search-console/services/google-search-console.service';
import type { GoogleSearchConsoleOAuthService } from '@api/services/integrations/google-search-console/services/google-search-console-oauth.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: (value: string) => `decrypted:${value}`,
  },
}));

type Row = Record<string, unknown> & { id: string };

const SITE = 'https://genfeed.ai/';
const API = 'https://www.googleapis.com/webmasters/v3';
const ANALYTICS_URL = `${API}/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`;

// Search Analytics rows Google holds for the site, keyed in the order of the
// default dimensions (query, page, country, device).
const analytics = [
  {
    clicks: 12,
    ctr: 0.25,
    impressions: 48,
    keys: ['genfeed ai', SITE, 'usa', 'DESKTOP'],
    position: 3.5,
  },
  { clicks: 3, impressions: 20, keys: ['ai os', SITE, 'mlt', 'MOBILE'] },
  { clicks: 1, impressions: 9, keys: ['content os', SITE, 'fra', 'TABLET'] },
];

interface AnalyticsQuery {
  dimensions: string[];
  rowLimit: number;
}

describe('GoogleSearchConsoleService', () => {
  let credentials: Map<string, Row>;
  let errors: string[];
  let isQuotaExceeded: boolean;
  let service: GoogleSearchConsoleService;

  beforeEach(() => {
    credentials = new Map([
      [
        'credential-id',
        {
          brandId: 'brand-id',
          id: 'credential-id',
          isConnected: true,
          organizationId: 'org-id',
          platform: 'google_search_console',
          refreshToken: 'encrypted-refresh-token',
        },
      ],
      [
        'other-brand',
        {
          brandId: 'brand-other',
          id: 'other-brand',
          isConnected: true,
          organizationId: 'org-id',
          platform: 'google_search_console',
          refreshToken: 'encrypted-other-token',
        },
      ],
    ]);
    errors = [];
    isQuotaExceeded = false;

    const authorize = (config: { headers: Record<string, string> }) => {
      if (config.headers.Authorization !== 'Bearer access-token') {
        throw new Error('401 unauthorized');
      }
    };
    // Google's API as the service reaches it: authorized calls only, and the
    // analytics answer shaped by the query's dimensions and row limit.
    const http = {
      get: (url: string, config: { headers: Record<string, string> }) => {
        if (isQuotaExceeded) {
          return throwError(() => new Error('quota exceeded'));
        }
        authorize(config);
        return of({
          data:
            url === `${API}/sites`
              ? { siteEntry: [{ permissionLevel: 'siteOwner', siteUrl: SITE }] }
              : {},
        });
      },
      post: (
        url: string,
        query: AnalyticsQuery,
        config: { headers: Record<string, string> },
      ) => {
        authorize(config);
        if (url !== ANALYTICS_URL) {
          return throwError(() => new Error('404 site not found'));
        }
        return of({
          data: {
            responseAggregationType: 'auto',
            rows: analytics.slice(0, query.rowLimit).map((row) => ({
              ...row,
              keys: row.keys.slice(0, query.dimensions.length),
            })),
          },
        });
      },
    };
    const oauth = {
      refreshAccessToken: async (refreshToken: string) => {
        if (refreshToken !== 'decrypted:encrypted-refresh-token') {
          throw new Error('invalid_grant');
        }
        return {
          accessToken: 'fresh-access-token',
          expiresIn: 3600,
          refreshToken: 'fresh-refresh-token',
        };
      },
    };
    const credentialsService = {
      patch: async (id: string, update: Record<string, unknown>) =>
        Object.assign(credentials.get(id) as Row, update),
      resolveBrandAccount: async (lookup: Row) =>
        [...credentials.values()].find(
          (credential) =>
            credential.organizationId === lookup.organizationId &&
            credential.brandId === lookup.brandId &&
            credential.platform === lookup.platform,
        ) ?? null,
    };

    service = new GoogleSearchConsoleService(
      credentialsService as unknown as CredentialsService,
      oauth as unknown as GoogleSearchConsoleOAuthService,
      http as unknown as HttpService,
      {
        error: (message: string) => errors.push(message),
      } as unknown as LoggerService,
    );
  });

  it('lists verified Search Console sites with the bearer token', async () => {
    await expect(service.listSites('access-token')).resolves.toEqual([
      { id: SITE, permissionLevel: 'siteOwner', siteUrl: SITE },
    ]);
  });

  it('maps Search Analytics keys onto the default dimensions', async () => {
    const result = await service.getSearchAnalytics('access-token', {
      endDate: '2026-06-29',
      siteUrl: SITE,
      startDate: '2026-06-01',
    });

    expect(result.dimensions).toEqual(['query', 'page', 'country', 'device']);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({
      clicks: 12,
      country: 'usa',
      device: 'DESKTOP',
      impressions: 48,
      page: SITE,
      position: 3.5,
      query: 'genfeed ai',
    });
    expect(result.rows[1]).toMatchObject({ ctr: 0, position: 0 });
  });

  it('honours requested dimensions and row limit, dropping unknown dimensions', async () => {
    const result = await service.getSearchAnalytics('access-token', {
      dimensions: ['query', 'bogus' as 'page'],
      endDate: '2026-06-29',
      rowLimit: 2,
      siteUrl: SITE,
      startDate: '2026-06-01',
    });

    expect(result.dimensions).toEqual(['query']);
    expect(result.rows).toEqual([
      expect.objectContaining({ keys: ['genfeed ai'], query: 'genfeed ai' }),
      expect.objectContaining({ keys: ['ai os'], query: 'ai os' }),
    ]);
  });

  it('stores refreshed tokens on the brand credential and reconnects it', async () => {
    (credentials.get('credential-id') as Row).isConnected = false;

    await service.refreshToken('org-id', 'brand-id');

    expect(credentials.get('credential-id')).toMatchObject({
      accessToken: 'fresh-access-token',
      isConnected: true,
      refreshToken: 'fresh-refresh-token',
    });
    expect(credentials.get('other-brand')).not.toHaveProperty('accessToken');
  });

  it('marks the credential disconnected when Google rejects the refresh token', async () => {
    (credentials.get('credential-id') as Row).refreshToken = 'revoked-token';

    await expect(service.refreshToken('org-id', 'brand-id')).rejects.toThrow(
      'invalid_grant',
    );
    expect(credentials.get('credential-id')?.isConnected).toBe(false);
    expect(errors).toHaveLength(1);
  });

  it('logs and rethrows Search Console API failures', async () => {
    isQuotaExceeded = true;

    await expect(service.listSites('access-token')).rejects.toThrow(
      'quota exceeded',
    );
    expect(errors).toEqual([expect.stringContaining('quota exceeded')]);
  });
});
