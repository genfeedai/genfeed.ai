import {
  findUnpriceableModelIds,
  unpriceableModelsScope,
} from '@api/collections/models/utils/model-pricing-attention.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

/**
 * How long a classification stays valid. A model that turns unpriceable is
 * offered for at most this long longer; the price itself is enforced where a
 * generation is quoted, not by this list.
 */
export const UNPRICEABLE_MODEL_IDS_TTL_MS = 30_000;

/** Scopes kept at once; the oldest entry goes first. */
const MAX_CACHED_SCOPES = 200;

const PLATFORM_SCOPE_KEY = 'platform';

interface CachedClassification {
  expiresAt: number;
  ids: Promise<string[]>;
}

/**
 * Keeps one load per key for a short while. Callers inside the window share
 * the same load, and a load that fails is not kept.
 */
export class UnpriceableModelIdsCache {
  private readonly entries = new Map<string, CachedClassification>();

  constructor(private readonly now: () => number = Date.now) {}

  read(key: string, load: () => Promise<string[]>): Promise<string[]> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.ids;

    const entry: CachedClassification = {
      expiresAt: this.now() + UNPRICEABLE_MODEL_IDS_TTL_MS,
      ids: load(),
    };
    entry.ids.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    this.entries.delete(key);
    this.entries.set(key, entry);
    if (this.entries.size > MAX_CACHED_SCOPES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return entry.ids;
  }

  clear(): void {
    this.entries.clear();
  }
}

const unpriceableModelIdsCache = new UnpriceableModelIdsCache();

/**
 * The ids `GET /models` leaves out, kept per organization for
 * {@link UNPRICEABLE_MODEL_IDS_TTL_MS}. Rebuilding them reads every model row
 * and its pricing contracts and classifies each in the request, which is the
 * cost the list used to pay on every call.
 */
export function readUnpriceableModelIds(
  prisma: PrismaService,
  organizationId?: string,
): Promise<string[]> {
  return unpriceableModelIdsCache.read(
    organizationId ?? PLATFORM_SCOPE_KEY,
    () =>
      findUnpriceableModelIds(prisma, unpriceableModelsScope(organizationId)),
  );
}

/** Forgets every kept classification, for specs. */
export function clearUnpriceableModelIdsCache(): void {
  unpriceableModelIdsCache.clear();
}
