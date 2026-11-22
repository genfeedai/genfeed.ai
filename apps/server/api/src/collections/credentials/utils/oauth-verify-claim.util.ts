import { OAUTH_STATE_TTL_MS } from '@api/collections/credentials/constants/oauth.constants';
import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import type {
  CredentialsService,
  OAuthCredentialScope,
  PendingOAuthCredential,
} from '@api/collections/credentials/services/credentials.service';
import { requireCredentialRelationId } from '@api/collections/credentials/utils/credential-persistence.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type CredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { isReservedExternalConnectionOAuthState } from '@genfeedai/helpers/integrations/external-connection-request.helper';
import type { Prisma } from '@genfeedai/prisma';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { traced } from '@libs/tracing/traced';

/** How long a second verify waits for the request that claimed the state. */
export const OAUTH_VERIFY_CLAIM_WAIT_MS = 15_000;
const OAUTH_VERIFY_CLAIM_POLL_MS = 250;
const CLAIMED_OAUTH_STATE_PREFIX = 'claimed:';

export type PendingOAuthFilter = {
  isConnected: false;
  oauthState: string;
  organizationId?: string;
  platform: CredentialPlatform;
  updatedAt: { gte: Date };
  userId?: string;
};

export type OAuthVerifyClaim =
  | { alreadyConnected: false; credential: PendingOAuthCredential }
  | { alreadyConnected: true; credential: CredentialDocument };

type OAuthVerifyClaimStore = Pick<
  CredentialsService,
  'claimPendingOAuthCredential' | 'findOne'
>;

/** The row a verify request owns once it won the claim. Never equals a state. */
const claimedOAuthState = (state: string): string =>
  `${CLAIMED_OAUTH_STATE_PREFIX}${state}`;

/** The pending-connection lookup, or null when the state cannot match. */
export function buildPendingOAuthFilter(
  state: string,
  platform: CredentialPlatform,
  scope?: Partial<OAuthCredentialScope>,
): PendingOAuthFilter | null {
  if (
    typeof state !== 'string' ||
    !state.trim() ||
    isReservedExternalConnectionOAuthState(state)
  ) {
    return null;
  }

  // Callers that omit `scope` (the provider-error callback util) still run
  // inside the authenticated request, so default to its tenant.
  const organizationId =
    scope?.organizationId ?? getTenantContext()?.organizationId;

  return {
    isConnected: false,
    oauthState: state,
    platform,
    updatedAt: { gte: new Date(Date.now() - OAUTH_STATE_TTL_MS) },
    ...(organizationId
      ? {
          organizationId: requireCredentialRelationId(
            organizationId,
            'organizationId',
          ),
        }
      : {}),
    ...(scope?.userId
      ? { userId: requireCredentialRelationId(scope.userId, 'userId') }
      : {}),
  };
}

/** The same lookup, once the row carries the claim marker instead of the state. */
export const claimedPendingOAuthFilter = (
  filter: PendingOAuthFilter,
): PendingOAuthFilter => ({
  ...filter,
  oauthState: claimedOAuthState(filter.oauthState),
});

export function toPendingOAuthCredential(
  credential: CredentialDocument | null,
): PendingOAuthCredential | null {
  if (
    !credential?.brandId ||
    !credential.organizationId ||
    !credential.userId
  ) {
    return null;
  }

  return credential as PendingOAuthCredential;
}

/**
 * Claim the pending row with one conditional write: the `where` repeats every
 * condition of the lookup, so exactly one of any number of concurrent callers
 * sees `count === 1`.
 */
export const claimPendingOAuthRow = traced(
  'claimPendingOAuthRow',
  async (
    prisma: Pick<PrismaService, 'credential'>,
    filter: PendingOAuthFilter,
  ): Promise<boolean> => {
    const platform = toPrismaCredentialPlatform(filter.platform);
    if (!platform) {
      return false;
    }

    const where: Prisma.CredentialWhereInput = {
      brandId: { not: null },
      isConnected: false,
      isDeleted: false,
      oauthState: filter.oauthState,
      organizationId: filter.organizationId ?? { not: null },
      platform,
      updatedAt: filter.updatedAt,
      userId: filter.userId ?? { not: null },
    };

    // sql-risk-audit: ignore bulk-write-tenant-review -- A compare-and-set on one pending row: the single-use oauthState (and the row's updatedAt) pick the row, isDeleted is false, and the caller's organization and user narrow it whenever the verify request names them. count === 1 is the claim.
    const { count } = await prisma.credential.updateMany({
      data: { oauthState: claimedOAuthState(filter.oauthState) },
      where,
    });

    return count === 1;
  },
);

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The state was already claimed. While the claiming request is still talking
 * to the provider its row carries the claim marker: wait for that row to
 * connect. A state with no claim marker is unknown, expired or fully used, and
 * never answers with some other account.
 */
const awaitClaimingRequest = traced(
  'awaitClaimingRequest',
  async (
    store: OAuthVerifyClaimStore,
    filter: PendingOAuthFilter,
  ): Promise<CredentialDocument | null> => {
    const { organizationId, platform, userId } = filter;
    const inFlight = await store.findOne(claimedPendingOAuthFilter(filter));

    if (!inFlight) {
      return null;
    }

    const deadline = Date.now() + OAUTH_VERIFY_CLAIM_WAIT_MS;
    while (Date.now() < deadline) {
      const row = await store.findOne({
        id: inFlight.id,
        organizationId,
        platform,
        userId,
      });
      if (row?.isConnected) {
        return row;
      }
      await pause(OAUTH_VERIFY_CLAIM_POLL_MS);
    }
    return null;
  },
);

/**
 * Shared first step of every OAuth verify endpoint. The caller either owns the
 * pending connection (and goes on to exchange the code), or another request
 * for the same state owns it and `alreadyConnected` carries the account that
 * request connected. Null means the state is unknown, expired or used.
 */
export const claimOAuthVerifyCredential = traced(
  'claimOAuthVerifyCredential',
  async (
    store: OAuthVerifyClaimStore,
    state: string,
    platform: CredentialPlatform,
    scope?: Partial<OAuthCredentialScope>,
  ): Promise<OAuthVerifyClaim | null> => {
    const claimed = await store.claimPendingOAuthCredential(
      state,
      platform,
      ...(scope ? [scope] : []),
    );
    if (claimed) {
      return { alreadyConnected: false, credential: claimed };
    }

    const filter = buildPendingOAuthFilter(state, platform, scope);
    if (!filter) {
      return null;
    }
    const connected = await awaitClaimingRequest(store, filter);
    return connected ? { alreadyConnected: true, credential: connected } : null;
  },
);
