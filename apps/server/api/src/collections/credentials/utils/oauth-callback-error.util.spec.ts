import { throwIfOAuthCallbackError } from '@api/collections/credentials/utils/oauth-callback-error.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import {
  EXTERNAL_CONNECTION_DENIED_STATE,
  EXTERNAL_CONNECTION_FAILED_STATE,
} from '@genfeedai/helpers/integrations/external-connection-request.helper';
import { HttpException, HttpStatus } from '@nestjs/common';

type Store = Parameters<typeof throwIfOAuthCallbackError>[0];
type PendingCredential = NonNullable<
  Awaited<ReturnType<Store['findPendingOAuthCredential']>>
>;

interface StoredCredential {
  id: string;
  isConnected: boolean;
  oauthState: string;
  platform: CredentialPlatform;
}

/** An in-memory credential table keyed by the pending OAuth state. */
function credentialStore(rows: StoredCredential[]) {
  const table = new Map(rows.map((row) => [row.id, { ...row }]));
  const store: Store = {
    findPendingOAuthCredential: async (state, platform) => {
      const row = [...table.values()].find(
        (item) => item.oauthState === state && item.platform === platform,
      );
      // Only the fields the callback reads; the rest of the row is not used.
      return row ? (row as unknown as PendingCredential) : null;
    },
    patch: async (id, update) => {
      const row = table.get(String(id));
      if (row) {
        Object.assign(row, update);
      }
      return row as unknown as Awaited<ReturnType<Store['patch']>>;
    },
  };
  return { store, table };
}

function pendingTwitter(overrides: Partial<StoredCredential> = {}) {
  return {
    id: 'cred-1',
    isConnected: false,
    oauthState: 'opaque-state',
    platform: CredentialPlatform.TWITTER,
    ...overrides,
  };
}

async function callbackFailure(
  promise: Promise<void>,
): Promise<{ status: number; title: string }> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof HttpException)) {
    throw new Error('Expected the callback to reject with an HttpException');
  }
  const body = error.getResponse() as { title: string };
  return { status: error.getStatus(), title: body.title };
}

describe('throwIfOAuthCallbackError', () => {
  it.each([
    [{ state: 'opaque-state' }],
    [{ error: '   ', state: 'opaque-state' }],
  ])(
    'leaves the pending credential alone when %j has no error code',
    async (dto) => {
      const { store, table } = credentialStore([pendingTwitter()]);

      await expect(
        throwIfOAuthCallbackError(store, dto, CredentialPlatform.TWITTER),
      ).resolves.toBeUndefined();

      expect(table.get('cred-1')?.oauthState).toBe('opaque-state');
    },
  );

  it.each([
    [
      'access_denied',
      CredentialPlatform.TWITTER,
      EXTERNAL_CONNECTION_DENIED_STATE,
      'Authorization denied',
    ],
    [
      'server_error',
      CredentialPlatform.YOUTUBE,
      EXTERNAL_CONNECTION_FAILED_STATE,
      'Authorization failed',
    ],
  ])(
    'records %s on the pending %s credential and rejects the callback',
    async (error, platform, oauthState, title) => {
      const { store, table } = credentialStore([pendingTwitter({ platform })]);

      expect(
        await callbackFailure(
          throwIfOAuthCallbackError(
            store,
            { error, state: 'opaque-state' },
            platform,
          ),
        ),
      ).toEqual({ status: HttpStatus.BAD_REQUEST, title });
      expect(table.get('cred-1')?.oauthState).toBe(oauthState);
    },
  );

  it('does not overwrite an already-connected credential', async () => {
    const { store, table } = credentialStore([
      pendingTwitter({ isConnected: true }),
    ]);

    expect(
      await callbackFailure(
        throwIfOAuthCallbackError(
          store,
          { error: 'access_denied', state: 'opaque-state' },
          CredentialPlatform.TWITTER,
        ),
      ),
    ).toEqual({
      status: HttpStatus.BAD_REQUEST,
      title: 'Authorization denied',
    });
    expect(table.get('cred-1')).toEqual(pendingTwitter({ isConnected: true }));
  });

  it('leaves another platform credential on the same state untouched', async () => {
    const { store, table } = credentialStore([
      pendingTwitter({ platform: CredentialPlatform.YOUTUBE }),
    ]);

    expect(
      await callbackFailure(
        throwIfOAuthCallbackError(
          store,
          { error: 'access_denied', state: 'opaque-state' },
          CredentialPlatform.TWITTER,
        ),
      ),
    ).toEqual({
      status: HttpStatus.BAD_REQUEST,
      title: 'Authorization denied',
    });
    expect(table.get('cred-1')?.oauthState).toBe('opaque-state');
  });

  it('rejects a provider error that carries no state', async () => {
    const { store, table } = credentialStore([pendingTwitter()]);

    expect(
      await callbackFailure(
        throwIfOAuthCallbackError(
          store,
          { error: 'access_denied' },
          CredentialPlatform.TWITTER,
        ),
      ),
    ).toEqual({ status: HttpStatus.BAD_REQUEST, title: 'Invalid payload' });
    expect(table.get('cred-1')?.oauthState).toBe('opaque-state');
  });
});
