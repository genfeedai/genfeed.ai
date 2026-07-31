import { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';

type MockCredentialRow = {
  accessToken: string | null;
  accessTokenExpiry: Date | null;
  accessTokenSecret: string | null;
  id: string;
  isConnected: boolean;
  oauthToken: string | null;
  oauthTokenSecret: string | null;
  platform: string;
  refreshToken: string | null;
  refreshTokenExpiry: Date | null;
};

function makeRow(
  overrides: Partial<MockCredentialRow> = {},
): MockCredentialRow {
  return {
    accessToken: 'access-token-value',
    accessTokenExpiry: new Date('2026-08-01T00:00:00.000Z'),
    accessTokenSecret: null,
    id: 'cred-x',
    isConnected: true,
    oauthToken: null,
    oauthTokenSecret: null,
    platform: CredentialPlatform.TWITTER,
    refreshToken: null,
    refreshTokenExpiry: null,
    ...overrides,
  };
}

describe('PostGroupReadinessService', () => {
  const now = new Date('2026-07-08T22:25:13.000Z');
  let service: PostGroupReadinessService;
  let tx: { credential: { findMany: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    service = new PostGroupReadinessService();
    tx = { credential: { findMany: vi.fn().mockResolvedValue([makeRow()]) } };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('resolves readiness through a tenant-scoped, soft-delete-filtered query', async () => {
    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
      'cred-x',
    ]);

    expect(tx.credential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['cred-x'] },
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(readiness.get('cred-x')).toMatchObject({
      canSchedule: true,
      state: 'publish_capable',
      tokenFreshness: 'pass',
    });
  });

  it('skips the query when there are no credentials to resolve', async () => {
    await expect(
      service.resolveForCredentials(tx, 'org-1', []),
    ).resolves.toEqual(new Map());
    expect(tx.credential.findMany).not.toHaveBeenCalled();
  });

  it('never exposes credential token material in the resolved readiness', async () => {
    tx.credential.findMany.mockResolvedValue([
      makeRow({
        accessToken: 'super-secret-access-token',
        refreshToken: 'super-secret-refresh-token',
      }),
    ]);

    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(JSON.stringify(readiness.get('cred-x'))).not.toContain('secret');
  });

  it('marks a disconnected credential as blocked and not schedulable', async () => {
    tx.credential.findMany.mockResolvedValue([makeRow({ isConnected: false })]);

    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(readiness.get('cred-x')).toMatchObject({
      canSchedule: false,
      state: 'blocked',
      tokenFreshness: 'fail',
    });
  });

  it('keeps a refreshable expired credential schedulable but degraded', async () => {
    tx.credential.findMany.mockResolvedValue([
      makeRow({
        accessTokenExpiry: new Date('2026-07-01T00:00:00.000Z'),
        refreshToken: 'refresh-token-value',
        refreshTokenExpiry: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ]);

    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(readiness.get('cred-x')).toMatchObject({
      canSchedule: true,
      state: 'degraded',
      tokenFreshness: 'warn',
    });
  });

  it('keeps unknown token expiry schedulable', async () => {
    tx.credential.findMany.mockResolvedValue([
      makeRow({ accessTokenExpiry: null }),
    ]);

    const readiness = await service.resolveForCredentials(tx, 'org-1', [
      'cred-x',
    ]);

    expect(readiness.get('cred-x')).toMatchObject({
      canSchedule: true,
      state: 'publish_capable',
      tokenFreshness: 'unknown',
    });
  });

  describe('assertSchedulable', () => {
    const target = {
      credentialId: 'cred-x',
      platform: CredentialPlatform.TWITTER,
    };

    it('passes a publish-capable channel through', async () => {
      const readiness = await service.resolveForCredentials(tx, 'org-1', [
        'cred-x',
      ]);

      expect(() =>
        service.assertSchedulable(target, readiness.get('cred-x')),
      ).not.toThrow();
    });

    it('throws an actionable error for a blocked channel', async () => {
      tx.credential.findMany.mockResolvedValue([
        makeRow({ accessToken: null }),
      ]);
      const readiness = await service.resolveForCredentials(tx, 'org-1', [
        'cred-x',
      ]);

      try {
        service.assertSchedulable(target, readiness.get('cred-x'));
        expect.unreachable('assertSchedulable should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          classification: 'expired_credential',
          credentialId: 'cred-x',
          platform: CredentialPlatform.TWITTER,
          readinessState: 'blocked',
          requiredAction: 'Reconnect the provider account before publishing.',
          title: 'Channel not ready to publish',
        });
      }
    });

    it('throws when readiness could not be resolved for the target', () => {
      expect(() => service.assertSchedulable(target, undefined)).toThrow(
        BadRequestException,
      );
    });
  });
});
