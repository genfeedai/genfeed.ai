import type { ServerCredentialStore } from '@api/index';
import type { LoggerService } from '@libs/logger/logger.service';
import { CronCredentialsService } from '@workers/crons/credentials/cron.credentials.service';

type Ctor = ConstructorParameters<typeof CronCredentialsService>;

interface CredentialRow {
  accessTokenExpiry: Date | null;
  brandId?: string;
  id: string;
  isConnected: boolean;
  isDeleted: boolean;
  organizationId?: string;
  platform: string;
}

const now = new Date('2026-11-06T12:00:00.000Z');
const inMinutes = (minutes: number) =>
  new Date(now.getTime() + minutes * 60 * 1000);

describe('CronCredentialsService.refreshExpiringTokens', () => {
  let credentials: CredentialRow[];
  let refreshed: Array<{ args: unknown[]; refresher: string }>;
  let failingCredentialIds: Set<string>;
  let summaries: unknown[];
  let service: CronCredentialsService;

  const credential = (
    id: string,
    overrides: Partial<CredentialRow> = {},
  ): CredentialRow => ({
    accessTokenExpiry: inMinutes(30),
    brandId: 'brand-1',
    id,
    isConnected: true,
    isDeleted: false,
    organizationId: 'org-1',
    platform: 'TWITTER',
    ...overrides,
  });

  const refresher = (name: string) => ({
    refreshToken: async (...args: unknown[]) => {
      if (failingCredentialIds.has(String(args[2]))) {
        throw new Error('refresh token revoked');
      }
      refreshed.push({ args, refresher: name });
      return {};
    },
  });

  beforeEach(() => {
    vi.useFakeTimers({ now });
    credentials = [];
    refreshed = [];
    failingCredentialIds = new Set();
    summaries = [];

    service = new CronCredentialsService(
      ...([
        {
          error: () => {},
          log: (message: string, context?: unknown) => {
            if (message.endsWith('completed')) summaries.push(context);
          },
          warn: () => {},
        } as unknown as LoggerService,
        {
          findAll: async ({
            where,
          }: {
            where: {
              accessTokenExpiry: { lt: Date };
              isConnected: boolean;
              isDeleted: boolean;
            };
          }) => ({
            docs: credentials.filter(
              (row) =>
                row.accessTokenExpiry !== null &&
                row.accessTokenExpiry < where.accessTokenExpiry.lt &&
                row.isConnected === where.isConnected &&
                row.isDeleted === where.isDeleted,
            ),
          }),
        } as unknown as ServerCredentialStore,
        refresher('facebook'),
        refresher('google-ads'),
        refresher('instagram'),
        refresher('linkedin'),
        refresher('pinterest'),
        refresher('reddit'),
        refresher('tiktok'),
        refresher('twitter'),
        refresher('youtube'),
      ] as unknown as Ctor),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes a Prisma SCREAMING twitter credential through the X refresher', async () => {
    credentials = [credential('cred-1')];

    await service.refreshExpiringTokens();

    expect(refreshed).toEqual([
      { args: ['org-1', 'brand-1', 'cred-1'], refresher: 'twitter' },
    ]);
    expect(summaries).toEqual([{ failures: 0, successes: 1, total: 1 }]);
  });

  it('refreshes each X account of a multi-account brand by its credential id', async () => {
    credentials = [credential('cred-a'), credential('cred-b')];

    await service.refreshExpiringTokens();

    expect(refreshed.map(({ args }) => args[2])).toEqual(['cred-a', 'cred-b']);
  });

  it.each([
    ['expires in more than an hour', { accessTokenExpiry: inMinutes(90) }],
    ['has no expiry', { accessTokenExpiry: null }],
    ['is disconnected', { isConnected: false }],
    ['is deleted', { isDeleted: true }],
  ])('leaves a credential that %s alone', async (_label, overrides) => {
    credentials = [credential('cred-1', overrides)];

    await service.refreshExpiringTokens();

    expect(refreshed).toEqual([]);
    expect(summaries).toEqual([]);
  });

  it.each([
    ['an X Ads credential', { platform: 'X_ADS' }],
    ['a credential without a workspace', { brandId: undefined }],
  ])(
    'counts %s as a failure without refreshing it',
    async (_label, overrides) => {
      credentials = [credential('cred-1', overrides)];

      await expect(service.refreshExpiringTokens()).resolves.toBeUndefined();

      expect(refreshed).toEqual([]);
      expect(summaries).toEqual([{ failures: 1, successes: 0, total: 1 }]);
    },
  );

  it('keeps refreshing the rest when one refresh fails', async () => {
    credentials = [
      credential('cred-bad'),
      credential('cred-yt', { platform: 'YOUTUBE' }),
    ];
    failingCredentialIds.add('cred-bad');

    await service.refreshExpiringTokens();

    expect(refreshed).toEqual([
      { args: ['org-1', 'brand-1', 'cred-yt'], refresher: 'youtube' },
    ]);
    expect(summaries).toEqual([{ failures: 1, successes: 1, total: 2 }]);
  });
});
