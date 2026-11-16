import { randomUUID } from 'node:crypto';
import {
  resolveOAuthAppUrl,
  resolveOAuthIssuerUrl,
} from '@api/oauth/oauth-metadata.util';
import { CacheService } from '@api/services/cache/cache.service';
import { BlueskyOAuthKeyService } from '@api/services/integrations/bluesky/services/bluesky-oauth-key.service';
import { BLUESKY_DEFAULT_SERVICE_URL } from '@api/services/integrations/bluesky/utils/bluesky-service-url.util';
import {
  NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedSessionStore,
  type NodeSavedState,
  type NodeSavedStateStore,
  type OAuthClientMetadataInput,
  type OAuthSession,
  type RuntimeLock,
  requestLocalLock,
} from '@atproto/oauth-client-node';
import { safeFetchWrap } from '@atproto-labs/fetch-node';
import { ConfigService } from '@libs/config/config.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const API_VERSION_PREFIX = 'v1';
const BLUESKY_CLIENT_METADATA_PATH = 'services/bluesky/client-metadata.json';
/** Page of the web app Bluesky sends the person back to after consent. */
const BLUESKY_REDIRECT_PATH = 'oauth/bluesky';
/**
 * `atproto` is required; `transition:generic` is the scope that lets a client
 * create posts and upload blobs in the account's repository.
 */
const BLUESKY_OAUTH_SCOPE = 'atproto transition:generic';
const REFRESH_LOCK_TTL_SECONDS = 30;
const REFRESH_LOCK_RETRY_MS = 200;
const REFRESH_LOCK_MAX_WAIT_MS = 25_000;
/** Largest response the client reads from Bluesky or from a PDS. */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const OUTBOUND_TIMEOUT_MS = 30_000;

interface BlueskyStateCapture {
  authorizationUrl: string;
  savedState: NodeSavedState;
  state: string;
}

interface BlueskyCompletedAuthorization {
  /** Server the account lives on, the audience of its access tokens. */
  audience: string;
  did: string;
  savedSession: NodeSavedSession;
  session: OAuthSession;
}

/** Where one credential keeps its saved OAuth session. */
export interface BlueskySessionBinding {
  read: () => Promise<NodeSavedSession | undefined>;
  remove: () => Promise<void>;
  write: (session: NodeSavedSession) => Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The Bluesky OAuth client: a confidential client that signs in with a key,
 * binds its tokens to a DPoP key, and keeps no password. Each use builds a
 * client over the stores of one credential, so two brands that connect the same
 * Bluesky account hold two separate sessions.
 */
@Traced()
@Injectable()
export class BlueskyOAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly keyService: BlueskyOAuthKeyService,
    private readonly cacheService: CacheService,
  ) {}

  private get clientId(): string {
    return `${resolveOAuthIssuerUrl(this.configService)}/${API_VERSION_PREFIX}/${BLUESKY_CLIENT_METADATA_PATH}`;
  }

  private get redirectUri(): string {
    return `${resolveOAuthAppUrl(this.configService)}/${BLUESKY_REDIRECT_PATH}`;
  }

  /** The metadata document Bluesky fetches at the client id to learn who we are. */
  async getClientMetadata(): Promise<OAuthClientMetadataInput> {
    const key = await this.keyService.getKey();
    return {
      application_type: 'web',
      client_id: this.clientId,
      client_name: 'Genfeed.ai',
      dpop_bound_access_tokens: true,
      grant_types: ['authorization_code', 'refresh_token'],
      jwks: { keys: [key.publicJwk as NonNullable<typeof key.publicJwk>] },
      redirect_uris: [this.redirectUri],
      response_types: ['code'],
      scope: BLUESKY_OAUTH_SCOPE,
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
    };
  }

  /**
   * Refresh tokens rotate on every use, so two refreshes of one session at the
   * same time revoke it. The lock makes every instance take turns; without
   * Redis it falls back to a lock in this process.
   */
  private readonly requestLock: RuntimeLock = async (name, fn) => {
    const token = randomUUID();
    const key = `bluesky-oauth:${name}`;
    const deadline = Date.now() + REFRESH_LOCK_MAX_WAIT_MS;
    for (;;) {
      const claim = await this.cacheService.acquireOwnedClaim(
        key,
        token,
        REFRESH_LOCK_TTL_SECONDS,
      );
      if (claim === 'unavailable') {
        return requestLocalLock(name, fn);
      }
      if (claim === 'claimed') {
        try {
          return await fn();
        } finally {
          await this.cacheService.releaseOwnedClaim(key, token);
        }
      }
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting to refresh the Bluesky session');
      }
      await sleep(REFRESH_LOCK_RETRY_MS);
    }
  };

  private async createClient(stores: {
    sessionStore: NodeSavedSessionStore;
    stateStore: NodeSavedStateStore;
  }): Promise<NodeOAuthClient> {
    const key = await this.keyService.getKey();
    return new NodeOAuthClient({
      clientMetadata: await this.getClientMetadata(),
      // The sign-in resolves the account's server from its DID document, which
      // the account controls: requests may not reach private addresses.
      fetch: safeFetchWrap({
        allowImplicitRedirect: true,
        responseMaxSize: MAX_RESPONSE_BYTES,
        ssrfProtection: true,
        timeout: OUTBOUND_TIMEOUT_MS,
      }),
      keyset: [key],
      requestLock: this.requestLock,
      ...stores,
    });
  }

  /**
   * Start a sign-in. Returns the Bluesky page to send the person to and the
   * state of the attempt, which the caller keeps until the person is back.
   */
  async beginAuthorization(
    input: string = BLUESKY_DEFAULT_SERVICE_URL,
  ): Promise<BlueskyStateCapture> {
    let captured: { key: string; value: NodeSavedState } | null = null;
    const client = await this.createClient({
      sessionStore: unusedSessionStore,
      stateStore: {
        del: async () => undefined,
        get: async () => undefined,
        set: async (key, value) => {
          captured = { key, value };
        },
      },
    });
    const authorizationUrl = await client.authorize(input, {
      scope: BLUESKY_OAUTH_SCOPE,
    });
    if (!captured) {
      throw new Error('Bluesky did not start an authorization');
    }
    const { key, value } = captured as { key: string; value: NodeSavedState };
    return {
      authorizationUrl: authorizationUrl.toString(),
      savedState: value,
      state: key,
    };
  }

  /** Finish a sign-in from the parameters Bluesky sent back to the app. */
  async completeAuthorization(
    params: URLSearchParams,
    savedState: NodeSavedState,
  ): Promise<BlueskyCompletedAuthorization> {
    const state = params.get('state');
    let savedSession: NodeSavedSession | null = null;
    const client = await this.createClient({
      sessionStore: {
        del: async () => undefined,
        get: async () => undefined,
        set: async (_sub, value) => {
          savedSession = value;
        },
      },
      stateStore: {
        del: async () => undefined,
        get: async (key) => (key === state ? savedState : undefined),
        set: async () => undefined,
      },
    });
    const { session } = await client.callback(params);
    if (!savedSession) {
      throw new Error('Bluesky did not return a session');
    }
    const info = await session.getTokenInfo(false);
    return {
      audience: info.aud,
      did: session.did,
      savedSession,
      session,
    };
  }

  /** An open session for the account a credential holds. */
  async restoreSession(
    did: string,
    binding: BlueskySessionBinding,
  ): Promise<OAuthSession> {
    const client = await this.createClient({
      sessionStore: {
        del: () => binding.remove(),
        get: () => binding.read(),
        set: (_sub, value) => binding.write(value),
      },
      stateStore: unusedStateStore,
    });
    return client.restore(did);
  }
}

const unusedSessionStore: NodeSavedSessionStore = {
  del: async () => undefined,
  get: async () => undefined,
  set: async () => undefined,
};

const unusedStateStore: NodeSavedStateStore = {
  del: async () => undefined,
  get: async () => undefined,
  set: async () => undefined,
};
