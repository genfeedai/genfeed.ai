import { CredentialPlatform } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountAnalyticsSnapshotService,
  extractProfileCounts,
} from './account-analytics-snapshot.service';

describe('extractProfileCounts', () => {
  it('reads follower and subscriber aliases from provider payloads', () => {
    expect(
      extractProfileCounts({
        followersCount: 1200,
        subscriberCount: 80,
      }),
    ).toEqual({ followers: 1200, subscribers: 80 });
  });

  it('ignores non-numeric payload fields', () => {
    expect(extractProfileCounts({ followers: 'many' })).toEqual({});
  });
});

describe('AccountAnalyticsSnapshotService', () => {
  const prisma = {
    accountAnalyticsSnapshot: {
      findFirst: vi.fn(),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  };

  let service: AccountAnalyticsSnapshotService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AccountAnalyticsSnapshotService(prisma as never);
  });

  it('upserts a daily snapshot for the exact credential', async () => {
    await service.upsertDailySnapshot({
      brandId: 'brand-1',
      credentialId: 'cred-1',
      followers: 1500,
      organizationId: 'org-1',
      platform: CredentialPlatform.INSTAGRAM,
      subscribers: null,
    });

    expect(prisma.accountAnalyticsSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          credentialId: 'cred-1',
          followers: 1500,
          organizationId: 'org-1',
          platform: 'INSTAGRAM',
        }),
        where: {
          credentialId_date: expect.objectContaining({
            credentialId: 'cred-1',
          }),
        },
      }),
    );
  });
});
