vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ProviderAccountPurgeService } from '@api/collections/credentials/services/provider-account-purge.service';
import { claimOAuthVerifyCredential } from '@api/collections/credentials/utils/oauth-verify-claim.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';

type Row = {
  brandId: string | null;
  id: string;
  isConnected: boolean;
  isDeleted: boolean;
  oauthState: string | null;
  organizationId: string | null;
  platform: string;
  updatedAt: Date;
  userId: string | null;
};

type Where = Record<string, unknown>;

const FAKE_STATE = 'fake-oauth-state';
const FAKE_CODE = 'fake-auth-code';
const ORG_ID = 'org-1';

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, wanted]) => {
    const actual = (row as unknown as Where)[key];
    if (wanted !== null && typeof wanted === 'object') {
      if ('not' in wanted) {
        return actual !== (wanted as { not: unknown }).not;
      }
      if ('gte' in wanted) {
        return (actual as Date) >= (wanted as { gte: Date }).gte;
      }
    }
    return actual === wanted;
  });
}

/** A credential table whose conditional update is atomic, like the database. */
function credentialTable(rows: Row[]) {
  return {
    credential: {
      findFirst: async ({ where }: { where: Where }) => {
        const found = rows.find((row) => matches(row, where));
        // A copy, as a driver returns: the service normalizes what it reads.
        return found ? { ...found } : null;
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: Partial<Row>;
        where: Where;
      }) => {
        const found = rows.filter((row) => matches(row, where));
        for (const row of found) {
          Object.assign(row, data, { updatedAt: new Date() });
        }
        return { count: found.length };
      },
    },
  };
}

function pendingRow(overrides: Partial<Row> = {}): Row {
  return {
    brandId: 'brand-1',
    id: 'credential-1',
    isConnected: false,
    isDeleted: false,
    oauthState: FAKE_STATE,
    organizationId: ORG_ID,
    platform: 'TWITTER',
    updatedAt: new Date(),
    userId: 'user-1',
    ...overrides,
  };
}

function serviceOver(rows: Row[]): CredentialsService {
  const prisma = credentialTable(rows);
  const accessBootstrapCache = {
    invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
  };
  return new CredentialsService(
    prisma as never,
    { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
    new CredentialCryptoService({
      tokenEncryptionKey: 'test-encryption-key-for-testing-only',
    } as unknown as ConfigService),
    { uploadToS3: vi.fn() } as never,
    new ProviderAccountPurgeService(
      prisma as never,
      accessBootstrapCache as never,
    ),
    { emit: vi.fn() } as unknown as EventEmitter2,
    accessBootstrapCache as never,
  );
}

const scope = { organizationId: ORG_ID, userId: 'user-1' };

describe('claimPendingOAuthCredential', () => {
  it('returns the pending row once and null for the same state afterwards', async () => {
    const service = serviceOver([pendingRow()]);

    const first = await service.claimPendingOAuthCredential(
      FAKE_STATE,
      CredentialPlatform.TWITTER,
      scope,
    );
    const second = await service.claimPendingOAuthCredential(
      FAKE_STATE,
      CredentialPlatform.TWITTER,
      scope,
    );

    expect(first?.id).toBe('credential-1');
    expect(second).toBeNull();
  });

  it.each([
    ['another platform', { platform: 'FACEBOOK' }],
    ['another organization', { organizationId: 'org-2' }],
    ['another user', { userId: 'user-2' }],
    ['an already connected row', { isConnected: true }],
    ['a soft-deleted row', { isDeleted: true }],
    ['an expired state', { updatedAt: new Date(0) }],
    ['a row without a brand', { brandId: null }],
  ])('does not claim %s', async (_label, overrides) => {
    const rows = [pendingRow(overrides)];
    const service = serviceOver(rows);

    const claimed = await service.claimPendingOAuthCredential(
      FAKE_STATE,
      CredentialPlatform.TWITTER,
      scope,
    );

    expect(claimed).toBeNull();
    expect(rows[0].oauthState).toBe(FAKE_STATE);
  });

  it('never claims the reserved denied or failed states', async () => {
    const rows = [pendingRow({ oauthState: 'denied' })];
    const service = serviceOver(rows);

    await expect(
      service.claimPendingOAuthCredential(
        'denied',
        CredentialPlatform.TWITTER,
        scope,
      ),
    ).resolves.toBeNull();
    expect(rows[0].oauthState).toBe('denied');
  });
});

describe('claimOAuthVerifyCredential', () => {
  /** A verify endpoint reduced to its claim, its provider exchange and its connect. */
  function verifier(rows: Row[], exchangeFails = false) {
    const service = serviceOver(rows);
    const exchanges: string[] = [];
    let release: () => void = () => undefined;
    const providerReplied = new Promise<void>((resolve) => {
      release = resolve;
    });

    async function verify(state: string) {
      const claim = await claimOAuthVerifyCredential(
        service,
        state,
        CredentialPlatform.TWITTER,
        scope,
      );
      if (!claim) {
        throw new Error('invalid or expired state');
      }
      if (claim.alreadyConnected) {
        return {
          connected: claim.credential.isConnected,
          id: claim.credential.id,
        };
      }
      exchanges.push(FAKE_CODE);
      await providerReplied;
      if (exchangeFails) {
        throw new Error('provider rejected the code');
      }
      const row = rows.find((item) => item.id === claim.credential.id);
      Object.assign(row ?? {}, { isConnected: true, oauthState: null });
      return { connected: true, id: claim.credential.id };
    }

    return { exchanges, release, verify };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exchanges the code once when two verifies race and answers both with the connection', async () => {
    const rows = [pendingRow()];
    const { exchanges, release, verify } = verifier(rows);

    const both = Promise.all([verify(FAKE_STATE), verify(FAKE_STATE)]);
    await vi.advanceTimersByTimeAsync(500);
    release();
    await vi.advanceTimersByTimeAsync(500);

    expect(await both).toEqual([
      { connected: true, id: 'credential-1' },
      { connected: true, id: 'credential-1' },
    ]);
    expect(exchanges.length).toBe(1);
    expect(rows[0].isConnected).toBe(true);
  });

  it('still fails an unknown state with the invalid state error', async () => {
    const { exchanges, verify } = verifier([pendingRow()]);

    await expect(verify('unknown-state')).rejects.toThrow(
      'invalid or expired state',
    );
    expect(exchanges.length).toBe(0);
  });

  it('gives up on a claim that never connects', async () => {
    const rows = [pendingRow()];
    const { release, verify } = verifier(rows, true);

    const winner = verify(FAKE_STATE);
    const loser = verify(FAKE_STATE);
    const outcomes = Promise.allSettled([winner, loser]);
    await vi.advanceTimersByTimeAsync(500);
    release();
    await vi.advanceTimersByTimeAsync(20_000);

    const [first, second] = await outcomes;
    expect(first.status).toBe('rejected');
    expect(second.status).toBe('rejected');
    expect(rows[0].isConnected).toBe(false);
  });

  it('leaves a connected credential connected when a later exchange fails', async () => {
    const rows = [pendingRow()];
    const first = verifier(rows);
    const firstResult = first.verify(FAKE_STATE);
    first.release();
    await vi.advanceTimersByTimeAsync(100);
    expect(await firstResult).toEqual({ connected: true, id: 'credential-1' });

    const second = verifier(rows, true);
    await expect(second.verify(FAKE_STATE)).rejects.toThrow(
      'invalid or expired state',
    );

    expect(second.exchanges.length).toBe(0);
    expect(rows[0]).toMatchObject({ isConnected: true, oauthState: null });
  });
});
