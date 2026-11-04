import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { CacheService } from '@api/services/cache/cache.service';
import { readRecord } from '@genfeedai/utils/data/extract.util';
import type { LoggerService } from '@libs/logger/logger.service';

type SnapshotSchema<TSnapshot> = {
  safeParse(
    value: unknown,
  ): { success: true; data: TSnapshot } | { success: false };
};

type PersistableSnapshot = {
  grantedScopes: string[];
  refreshAttemptedAt: string;
  state: string;
};

/** Reads and validates a platform's stored snapshot from `warmupSignals`. */
export function readStoredAuthorizedSnapshot<TSnapshot>(
  credential: Pick<CredentialDocument, 'warmupSignals'>,
  storageKey: string,
  schema: SnapshotSchema<TSnapshot>,
): TSnapshot | undefined {
  const stored = readRecord(credential.warmupSignals);
  const parsed = schema.safeParse(stored[storageKey]);

  return parsed.success ? parsed.data : undefined;
}

type PersistAuthorizedSnapshotParams<TSnapshot extends PersistableSnapshot> = {
  authorizationStorageKey: string;
  cacheKey: string;
  cacheService: Pick<CacheService, 'set'>;
  /** Cache tags, in addition to the credential id which is always appended. */
  cacheTags: string[];
  credential: Pick<CredentialDocument, 'brandId' | 'id'>;
  credentialsService: Pick<CredentialsService, 'mergeWarmupSignals'>;
  freshTtlSeconds: number;
  loggerService: Pick<LoggerService, 'log'>;
  loggerName: string;
  organizationId: string;
  signalsStorageKey: string;
  snapshot: TSnapshot;
  staleTtlSeconds: number;
  syncEnrollment: (params: {
    brandId: string;
    credentialId: string;
    organizationId: string;
    snapshot: TSnapshot;
  }) => Promise<void>;
};

/**
 * Persists a refreshed snapshot: merges only the platform-owned
 * `warmupSignals` keys atomically (so concurrent warmup writers never lose
 * evidence to a stale full-object replace), syncs the brand's warmup
 * enrollment, then caches the snapshot with a shorter TTL while it is stale
 * or revoked.
 */
export async function persistAuthorizedSnapshot<
  TSnapshot extends PersistableSnapshot,
>(params: PersistAuthorizedSnapshotParams<TSnapshot>): Promise<TSnapshot> {
  const { credential, organizationId, snapshot } = params;

  await params.credentialsService.mergeWarmupSignals(
    credential.id,
    organizationId,
    {
      [params.authorizationStorageKey]: {
        grantedScopes: snapshot.grantedScopes,
        observedAt: snapshot.refreshAttemptedAt,
      },
      [params.signalsStorageKey]: snapshot,
    },
  );
  if (credential.brandId) {
    await params.syncEnrollment({
      brandId: credential.brandId,
      credentialId: credential.id,
      organizationId,
      snapshot,
    });
  }
  await params.cacheService.set(params.cacheKey, snapshot, {
    tags: [...params.cacheTags, credential.id],
    ttl:
      snapshot.state === 'stale' || snapshot.state === 'revoked'
        ? params.staleTtlSeconds
        : params.freshTtlSeconds,
  });

  params.loggerService.log(`${params.loggerName} refresh completed`, {
    credentialId: credential.id,
    state: snapshot.state,
  });
  return snapshot;
}
