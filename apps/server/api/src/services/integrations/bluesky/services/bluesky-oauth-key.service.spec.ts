vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: (value: string) => value.replace(/^enc:/, ''),
    encrypt: (value: string) => `enc:${value}`,
  },
}));

import { BlueskyOAuthKeyService } from '@api/services/integrations/bluesky/services/bluesky-oauth-key.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface Row {
  keyId: string;
  privateJwk: string;
  provider: string;
  publicJwk: Record<string, unknown>;
}

/** An in-memory table with the unique `provider` column the real one has. */
function makeTable() {
  const rows: Row[] = [];
  return {
    rows,
    table: {
      create: async ({ data }: { data: Row }) => {
        if (rows.some((row) => row.provider === data.provider)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        rows.push(data);
      },
      findUnique: async ({ where }: { where: { provider: string } }) =>
        rows.find((row) => row.provider === where.provider) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { provider: string } }) => {
        const row = rows.find((item) => item.provider === where.provider);
        if (!row) {
          throw new Error('missing');
        }
        return row;
      },
    },
  };
}

describe('BlueskyOAuthKeyService', () => {
  let rows: Row[];
  let table: ReturnType<typeof makeTable>['table'];

  beforeEach(() => {
    ({ rows, table } = makeTable());
  });

  const serviceOver = () =>
    new BlueskyOAuthKeyService({ platformSigningKey: table } as never);

  it('mints one key on first use and stores its private half encrypted', async () => {
    const key = await serviceOver().getKey();

    expect(rows).toHaveLength(1);
    expect(rows[0].privateJwk.startsWith('enc:')).toBe(true);
    expect(rows[0].publicJwk).not.toHaveProperty('d');
    expect(rows[0].keyId).toBe(key.kid);
    expect(rows[0].publicJwk).toMatchObject({
      alg: 'ES256',
      crv: 'P-256',
      key_ops: ['verify'],
      kty: 'EC',
    });
  });

  it('gives every later call, and every other instance, the same key', async () => {
    const first = await serviceOver().getKey();
    const other = await serviceOver().getKey();
    const again = await serviceOver().getKey();

    expect(other.kid).toBe(first.kid);
    expect(again.kid).toBe(first.kid);
    expect(rows).toHaveLength(1);
  });

  it('signs with the stored private key', async () => {
    const first = await serviceOver().getKey();
    const reloaded = await serviceOver().getKey();

    const jwt = await reloaded.createJwt(
      { alg: 'ES256', kid: reloaded.kid },
      { iss: 'genfeed' },
    );

    expect((await first.verifyJwt(jwt)).payload.iss).toBe('genfeed');
  });

  it('uses the key another instance created at the same moment', async () => {
    const results = await Promise.all([
      serviceOver().getKey(),
      serviceOver().getKey(),
      serviceOver().getKey(),
    ]);

    expect(rows).toHaveLength(1);
    expect(new Set(results.map((key) => key.kid))).toEqual(
      new Set([rows[0].keyId]),
    );
  });
});
