/**
 * mongo-to-postgres-mapping.ts
 *
 * Defines the collection-to-table mapping for migrating data from 7 MongoDB
 * databases to 1 PostgreSQL database. Imported by the main ETL script.
 *
 * Phase overview:
 *   1 — Root entities (no FK deps)
 *   2 — First-level dependents (reference Phase 1)
 *   3 — Everything else
 *   4 — Back-fill and join tables (handled in main script, not here)
 */

import type { Document } from 'mongodb';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** tableName -> mongoHex -> cuid */
export type MongoIdToCuidMap = Map<string, Map<string, string>>;

export interface CollectionMapping {
  mongoDb: string;
  mongoCollection: string;
  /** Prisma client accessor name (camelCase) */
  prismaModel: string;
  /** PostgreSQL table name from @@map */
  pgTable: string;
  phase: 1 | 2 | 3 | 4;
  /** Injected for consolidated tables (e.g. 'IMAGE') */
  categoryOverride?: string;
  transform: (
    doc: Document,
    idMap: MongoIdToCuidMap,
  ) => Record<string, unknown> | null;
}

export interface JoinTableMapping {
  mongoDb: string;
  mongoCollection: string;
  /** The array field in the MongoDB document */
  mongoField: string;
  /** Prisma implicit join table name */
  joinTable: string;
  /** e.g. 'A' */
  leftColumn: string;
  /** e.g. 'B' */
  rightColumn: string;
  /** Used to resolve the left-side CUID */
  leftPgTable: string;
  /** Used to resolve the right-side CUID */
  rightPgTable: string;
}

export interface BackfillMapping {
  pgTable: string;
  fkColumn: string;
  refPgTable: string;
  /** Field name in MongoDB source document */
  mongoField: string;
  mongoDb: string;
  mongoCollection: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a MongoDB enum string to a Postgres-style UPPER_SNAKE enum value. */
export function toPostgresEnum(
  mongoValue: string | undefined | null,
): string | null {
  if (!mongoValue) return null;
  return mongoValue.toUpperCase().replace(/-/g, '_');
}

/** Resolve a MongoDB ObjectId ref (ObjectId or string) to a CUID via the idMap. */
export function resolveRef(
  idMap: MongoIdToCuidMap,
  tableName: string,
  mongoRef: unknown,
): string | null {
  if (!mongoRef) return null;
  const hex =
    typeof mongoRef === 'string'
      ? mongoRef
      : (mongoRef as { toString(): string }).toString();
  return idMap.get(tableName)?.get(hex) ?? null;
}

/**
 * Recursively convert a MongoDB sub-document to a JSON-safe plain object.
 * - ObjectIds → hex strings
 * - Maps → plain objects
 * - Legacy __v fields → stripped
 */
export function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (
    typeof value === 'object' &&
    (value as { constructor?: { name?: string } }).constructor?.name ===
      'ObjectId'
  ) {
    return (value as { toString(): string }).toString();
  }
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([k, v]) => [k, toJsonSafe(v)]),
    );
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === '__v') continue;
      result[k] = toJsonSafe(v);
    }
    return result;
  }
  return value;
}

/**
 * Resolve an FK from a MongoDB doc, handling both old-style ObjectId field
 * (e.g. doc.user) and new-style string ID field (e.g. doc.userId).
 *
 * @param doc         - the source MongoDB document
 * @param fieldName   - the base field name without "Id" suffix (e.g. 'user')
 * @param idMap       - the global ID map
 * @param pgTable     - the target PostgreSQL table name (e.g. 'users')
 */
function resolveDocRef(
  doc: Document,
  fieldName: string,
  idMap: MongoIdToCuidMap,
  pgTable: string,
): string | null {
  // New-style: doc.userId is already a string CUID (post-migration docs)
  const idKey = `${fieldName}Id`;
  if (
    doc[idKey] &&
    typeof doc[idKey] === 'string' &&
    !doc[idKey].match(/^[0-9a-f]{24}$/i)
  ) {
    return doc[idKey] as string;
  }
  // Old-style: doc.user or doc.userId is an ObjectId (or 24-char hex string)
  const ref = doc[fieldName] ?? doc[idKey];
  return resolveRef(idMap, pgTable, ref);
}

/**
 * Factory for simple "data-bag" model transforms that share the common pattern:
 * { mongoId, organizationId, brandId?, userId?, [jsonField]: Json, isDeleted, createdAt, updatedAt }
 */
function createSimpleTransform(opts: {
  jsonFields?: string[];
  enumFields?: Record<string, string | null>;
  extraRefs?: Array<{ field: string; pgTable: string; outKey: string }>;
  requiredRefs?: string[];
}): CollectionMapping['transform'] {
  const {
    jsonFields = [],
    enumFields = {},
    extraRefs = [],
    requiredRefs = [],
  } = opts;

  return (doc: Document, idMap: MongoIdToCuidMap) => {
    const mongoId = (doc._id as { toString(): string }).toString();
    const organizationId = resolveDocRef(
      doc,
      'organization',
      idMap,
      'organizations',
    );
    const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
    const userId = resolveDocRef(doc, 'user', idMap, 'users');

    if (requiredRefs.includes('organization') && !organizationId) return null;
    if (requiredRefs.includes('user') && !userId) return null;

    const result: Record<string, unknown> = {
      mongoId,
      organizationId,
      brandId,
      userId,
      isDeleted: doc.isDeleted ?? false,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };

    for (const field of jsonFields) {
      result[field] = toJsonSafe(doc[field]) ?? null;
    }

    for (const [field, fallback] of Object.entries(enumFields)) {
      result[field] =
        toPostgresEnum(doc[field] as string | undefined | null) ??
        fallback ??
        null;
    }

    for (const ref of extraRefs) {
      result[ref.outKey] = resolveDocRef(doc, ref.field, idMap, ref.pgTable);
    }

    return result;
  };
}

// ---------------------------------------------------------------------------
// Skipped collections
// ---------------------------------------------------------------------------

export const SKIPPED_COLLECTIONS = [
  {
    mongoDb: 'auth',
    mongoCollection: 'user-credit-balances',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'auth',
    mongoCollection: 'user-credit-transactions',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'marketplace',
    mongoCollection: 'sellers',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'marketplace',
    mongoCollection: 'listings',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'marketplace',
    mongoCollection: 'purchases',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'agent',
    mongoCollection: 'agent-input-requests',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'agent',
    mongoCollection: 'agent-session-bindings',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'agent',
    mongoCollection: 'agent-profile-snapshots',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'crm',
    mongoCollection: 'crm-tasks',
    reason: 'No Prisma model (CRM-specific tasks)',
  },
  {
    mongoDb: 'crm',
    mongoCollection: 'companies',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'crm',
    mongoCollection: 'alignment-rules',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'crm',
    mongoCollection: 'cost-records',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'crm',
    mongoCollection: 'lead-activities',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'crm',
    mongoCollection: 'revenue-records',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'fanvue',
    mongoCollection: 'fanvue-sync-logs',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'fanvue',
    mongoCollection: 'creators',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'fanvue',
    mongoCollection: 'messages',
    reason: 'No Prisma model (Fanvue messages)',
  },
  {
    mongoDb: 'fanvue',
    mongoCollection: 'conversations',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'content-skills',
    reason: 'No Prisma model (merged into skills)',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'issue-counters',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'projects',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'issue-comments',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'issues',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'brand-skill-bindings',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'workspace-tasks',
    reason: 'No Prisma model',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'remote-studio-compositions',
    reason: 'No Prisma model',
  },
] as const;

// ---------------------------------------------------------------------------
// COLLECTION_MAPPINGS
// ---------------------------------------------------------------------------

export const COLLECTION_MAPPINGS: CollectionMapping[] = [
  // =========================================================================
  // PHASE 1 — Root entities (no FK deps)
  // =========================================================================

  {
    mongoDb: 'auth',
    mongoCollection: 'users',
    prismaModel: 'user',
    pgTable: 'users',
    phase: 1,
    transform: (doc) => {
      if (!doc.handle) return null;
      const mongoId = (doc._id as { toString(): string }).toString();
      return {
        mongoId,
        clerkId: doc.clerkId ?? null,
        handle: doc.handle,
        firstName: doc.firstName ?? null,
        lastName: doc.lastName ?? null,
        email: doc.email ?? null,
        avatar: doc.avatar ?? null,
        isDefault: doc.isDefault ?? false,
        isDeleted: doc.isDeleted ?? false,
        isInvited: doc.isInvited ?? false,
        isOnboardingCompleted: doc.isOnboardingCompleted ?? false,
        onboardingStartedAt: doc.onboardingStartedAt ?? null,
        onboardingCompletedAt: doc.onboardingCompletedAt ?? null,
        onboardingType: toPostgresEnum(
          doc.onboardingType as string | undefined | null,
        ),
        onboardingStepsCompleted: Array.isArray(doc.onboardingStepsCompleted)
          ? (doc.onboardingStepsCompleted as string[])
          : [],
        appSource:
          toPostgresEnum(doc.appSource as string | undefined | null) ??
          'GENFEED',
        stripeCustomerId: doc.stripeCustomerId ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'organizations',
    prismaModel: 'organization',
    pgTable: 'organizations',
    phase: 1,
    transform: (doc, idMap) => {
      if (!doc.label || !doc.slug) return null;
      const mongoId = (doc._id as { toString(): string }).toString();
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      if (!userId) return null; // CRITICAL: skip if user unresolvable

      return {
        mongoId,
        userId,
        label: doc.label,
        slug: doc.slug,
        prefix: doc.prefix ?? null,
        isSelected: doc.isSelected ?? false,
        isDefault: doc.isDefault ?? false,
        isDeleted: doc.isDeleted ?? false,
        category:
          toPostgresEnum(doc.category as string | undefined | null) ??
          'BUSINESS',
        accountType:
          toPostgresEnum(doc.accountType as string | undefined | null) ?? null,
        onboardingCompleted: doc.onboardingCompleted ?? false,
        isProactiveOnboarding: doc.isProactiveOnboarding ?? false,
        proactiveWelcomeDismissed: doc.proactiveWelcomeDismissed ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  // =========================================================================
  // PHASE 2 — First-level dependents (reference Phase 1)
  // =========================================================================

  {
    mongoDb: 'auth',
    mongoCollection: 'roles',
    prismaModel: 'role',
    pgTable: 'roles',
    phase: 2,
    transform: (doc) => {
      if (!doc.label || !doc.key) return null;
      const mongoId = (doc._id as { toString(): string }).toString();
      return {
        mongoId,
        label: doc.label,
        key: doc.key,
        primaryColor: doc.primaryColor ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'members',
    prismaModel: 'member',
    pgTable: 'members',
    phase: 2,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const roleId = resolveDocRef(doc, 'role', idMap, 'roles');
      // brands is M2M — handled in Phase 4 via JOIN_TABLE_MAPPINGS
      // lastUsedBrand may be Phase 2, but brand insertion order isn't guaranteed — null-safe
      const lastUsedBrandId = resolveDocRef(
        doc,
        'lastUsedBrand',
        idMap,
        'brands',
      );

      return {
        mongoId,
        organizationId,
        userId,
        roleId,
        lastUsedBrandId,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'settings',
    prismaModel: 'setting',
    pgTable: 'settings',
    phase: 2,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        userId,
        dashboardPreferences: toJsonSafe(doc.dashboardPreferences) ?? null,
        contentPreferences: Array.isArray(doc.contentPreferences)
          ? (doc.contentPreferences as string[])
          : [],
        favoriteModelKeys: Array.isArray(doc.favoriteModelKeys)
          ? (doc.favoriteModelKeys as string[])
          : [],
        ...(doc.trendNotificationsFrequency
          ? {
              trendNotificationsFrequency: toPostgresEnum(
                doc.trendNotificationsFrequency as string,
              ),
            }
          : {}),
        ...(doc.generationPriority
          ? {
              generationPriority: toPostgresEnum(
                doc.generationPriority as string,
              ),
            }
          : {}),
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'organization-settings',
    prismaModel: 'organizationSetting',
    pgTable: 'organization_settings',
    phase: 2,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      return {
        mongoId,
        organizationId,
        ...(doc.agentReplyStyle
          ? { agentReplyStyle: toPostgresEnum(doc.agentReplyStyle as string) }
          : {}),
        ...(doc.byokBillingStatus
          ? {
              byokBillingStatus: toPostgresEnum(
                doc.byokBillingStatus as string,
              ),
            }
          : {}),
        byokKeys: toJsonSafe(doc.byokKeys) ?? null,
        agentPolicy: toJsonSafe(doc.agentPolicy) ?? null,
        onboardingJourneyMissions:
          toJsonSafe(doc.onboardingJourneyMissions) ?? null,
        defaultVoiceRef: toJsonSafe(doc.defaultVoiceRef) ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'credentials',
    prismaModel: 'credential',
    pgTable: 'credentials',
    phase: 2,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const _brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const _userId = resolveDocRef(doc, 'user', idMap, 'users');
      // tags is M2M — handled in Phase 4

      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        platform: toPostgresEnum(doc.platform as string | undefined | null),
        label: doc.label ?? null,
        externalHandle: doc.handle ?? null,
        externalAvatar: doc.avatar ?? null,
        accessToken: doc.accessToken ?? null,
        refreshToken: doc.refreshToken ?? null,
        accessTokenExpiry: doc.expiresAt ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'api-keys',
    prismaModel: 'apiKey',
    pgTable: 'api_keys',
    phase: 2,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      return {
        mongoId,
        userId,
        organizationId,
        category:
          toPostgresEnum(doc.category as string | undefined | null) ??
          'GENFEEDAI',
        scopes: Array.isArray(doc.scopes) ? (doc.scopes as string[]) : [],
        allowedIps: Array.isArray(doc.allowedIps)
          ? (doc.allowedIps as string[])
          : [],
        metadata: toJsonSafe(doc.metadata) ?? null,
        key: doc.key ?? null,
        label: doc.label ?? null,
        expiresAt: doc.expiresAt ?? null,
        lastUsedAt: doc.lastUsedAt ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  // org-integrations may exist in cloud db or auth db — map cloud db here;
  // the main ETL script should also try the auth db and skip duplicates.
  {
    mongoDb: 'cloud',
    mongoCollection: 'org-integrations',
    prismaModel: 'orgIntegration',
    pgTable: 'org_integrations',
    phase: 2,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        organizationId,
        brandId,
        platform: toPostgresEnum(doc.platform as string | undefined | null),
        status: toPostgresEnum(doc.status as string | undefined | null),
        config: toJsonSafe(doc.config) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'models',
    prismaModel: 'model',
    pgTable: 'models',
    phase: 2,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      // training and parentModel are Phase 3 / self-refs — null initially, back-filled in Phase 4
      const trainingId = resolveDocRef(doc, 'training', idMap, 'trainings');
      const parentModelId = resolveDocRef(doc, 'parentModel', idMap, 'models');
      return {
        mongoId,
        organizationId,
        trainingId,
        parentModelId,
        label: doc.label ?? null,
        externalId: doc.key ?? doc.externalId ?? null,
        config:
          toJsonSafe({
            provider: doc.provider,
            category: doc.category,
            ...((doc.config as Record<string, unknown>) ?? {}),
          }) ?? {},
        isActive: doc.isActive ?? true,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'brands',
    prismaModel: 'brand',
    pgTable: 'brands',
    phase: 2,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      // voiceIngredient, musicIngredient back-filled in Phase 4
      return {
        mongoId,
        userId,
        organizationId,
        slug: doc.slug ?? null,
        label: doc.label ?? null,
        description: doc.description ?? null,
        text: doc.text ?? null,
        fontFamily:
          toPostgresEnum(doc.fontFamily as string | undefined | null) ??
          'INTER',
        primaryColor: doc.primaryColor ?? '#000000',
        secondaryColor: doc.secondaryColor ?? '#000000',
        backgroundColor: doc.backgroundColor ?? '#ffffff',
        referenceImages: toJsonSafe(doc.referenceImages) ?? [],
        isSelected: doc.isSelected ?? false,
        scope: toPostgresEnum(doc.scope as string | undefined | null) ?? 'USER',
        isActive: doc.isActive ?? true,
        isDefault: doc.isDefault ?? false,
        isDeleted: doc.isDeleted ?? false,
        isHighlighted: doc.isHighlighted ?? false,
        isDarkroomEnabled: doc.isDarkroomEnabled ?? false,
        defaultVideoModel: doc.defaultVideoModel ?? null,
        defaultImageModel: doc.defaultImageModel ?? null,
        defaultImageToVideoModel: doc.defaultImageToVideoModel ?? null,
        defaultMusicModel: doc.defaultMusicModel ?? null,
        agentConfig: toJsonSafe(doc.agentConfig) ?? {},
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  // =========================================================================
  // PHASE 3 — Everything else
  // =========================================================================

  // ---- Ingredient consolidation (7 MongoDB collections → 1 ingredients table) ----

  ...(
    [
      {
        mongoDb: 'cloud',
        mongoCollection: 'images',
        categoryOverride: 'IMAGE',
      },
      {
        mongoDb: 'cloud',
        mongoCollection: 'videos',
        categoryOverride: 'VIDEO',
      },
      { mongoDb: 'cloud', mongoCollection: 'gifs', categoryOverride: 'GIF' },
      {
        mongoDb: 'cloud',
        mongoCollection: 'musics',
        categoryOverride: 'MUSIC',
      },
      {
        mongoDb: 'cloud',
        mongoCollection: 'speech',
        categoryOverride: 'AUDIO',
      },
      {
        mongoDb: 'cloud',
        mongoCollection: 'avatars',
        categoryOverride: 'AVATAR',
      },
      {
        mongoDb: 'cloud',
        mongoCollection: 'ingredients',
        categoryOverride: undefined,
      },
    ] as Array<{
      mongoDb: string;
      mongoCollection: string;
      categoryOverride?: string;
    }>
  ).map(
    ({ mongoDb, mongoCollection, categoryOverride }): CollectionMapping => ({
      mongoDb,
      mongoCollection,
      prismaModel: 'ingredient',
      pgTable: 'ingredients',
      phase: 3,
      categoryOverride,
      transform: (doc, idMap) => {
        const mongoId = (doc._id as { toString(): string }).toString();
        const organizationId = resolveDocRef(
          doc,
          'organization',
          idMap,
          'organizations',
        );
        const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
        const userId = resolveDocRef(doc, 'user', idMap, 'users');
        const folderId = resolveDocRef(doc, 'folder', idMap, 'folders');
        const parentId = resolveDocRef(doc, 'parent', idMap, 'ingredients');
        const metadataId = resolveDocRef(doc, 'metadata', idMap, 'metadata');
        const promptId = resolveDocRef(doc, 'prompt', idMap, 'prompts');
        const trainingId = resolveDocRef(doc, 'training', idMap, 'trainings');
        const bookmarkId = resolveDocRef(doc, 'bookmark', idMap, 'bookmarks');
        const personaId = resolveDocRef(doc, 'persona', idMap, 'personas');
        const agentRunId = resolveDocRef(
          doc,
          'agentRun',
          idMap,
          'agent_threads',
        );
        const agentStrategyId = resolveDocRef(
          doc,
          'agentStrategy',
          idMap,
          'agent_strategies',
        );

        return {
          mongoId,
          organizationId,
          brandId,
          userId,
          folderId,
          parentId,
          metadataId,
          promptId,
          trainingId,
          bookmarkId,
          personaId,
          agentRunId,
          agentStrategyId,
          category:
            categoryOverride ??
            toPostgresEnum(doc.category as string | undefined | null),
          status:
            toPostgresEnum(doc.status as string | undefined | null) ?? 'DRAFT',
          scope:
            toPostgresEnum(doc.scope as string | undefined | null) ?? 'USER',
          qualityStatus:
            toPostgresEnum(doc.qualityStatus as string | undefined | null) ??
            'UNRATED',
          contentRating: toPostgresEnum(
            doc.contentRating as string | undefined | null,
          ),
          reviewStatus: toPostgresEnum(
            doc.reviewStatus as string | undefined | null,
          ),
          assetLabel: toPostgresEnum(
            doc.assetLabel as string | undefined | null,
          ),
          voiceProvider: toPostgresEnum(
            doc.voiceProvider as string | undefined | null,
          ),
          cloneStatus: toPostgresEnum(
            doc.cloneStatus as string | undefined | null,
          ),
          transformations: Array.isArray(doc.transformations)
            ? (doc.transformations as string[])
                .map((t) => toPostgresEnum(t))
                .filter(Boolean)
            : [],
          postedTo: Array.isArray(doc.postedTo)
            ? (doc.postedTo as string[])
            : [],
          qualityFeedback: Array.isArray(doc.qualityFeedback)
            ? (doc.qualityFeedback as string[])
            : [],
          providerData: toJsonSafe(doc.providerData) ?? null,
          // sources and tags are M2M — handled in Phase 4
          cdnUrl: doc.url ?? doc.cdnUrl ?? null,
          mimeType: doc.mimeType ?? null,
          fileSize: doc.size ?? doc.fileSize ?? null,
          generationPrompt: doc.prompt ?? doc.generationPrompt ?? null,
          negativePrompt: doc.negativePrompt ?? null,
          generationSeed: doc.seed ?? doc.generationSeed ?? null,
          isPublic: doc.isPublic ?? false,
          isDeleted: doc.isDeleted ?? false,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        };
      },
    }),
  ),

  // ---- Other Phase 3 collections ----

  {
    mongoDb: 'cloud',
    mongoCollection: 'metadata',
    prismaModel: 'metadata',
    pgTable: 'metadata',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const promptId = resolveDocRef(doc, 'prompt', idMap, 'prompts');
      return {
        mongoId,
        promptId,
        label: doc.label ?? '',
        extension:
          toPostgresEnum(doc.extension as string | undefined | null) ?? 'PNG',
        description: doc.description ?? '',
        result: toJsonSafe(doc.result) ?? '',
        model: doc.model ?? null,
        style: doc.style ?? null,
        assistant: doc.assistant ?? null,
        error: doc.error ?? null,
        externalId: doc.externalId ?? null,
        externalProvider: doc.externalProvider ?? null,
        width: Math.min(doc.width ?? 0, 2147483647),
        height: Math.min(doc.height ?? 0, 2147483647),
        duration: doc.duration ?? 0,
        size: Math.min(doc.size ?? 0, 2147483647),
        fps: doc.fps ?? null,
        resolution: doc.resolution ?? null,
        seed:
          typeof doc.seed === 'number' ? Math.min(doc.seed, 2147483647) : null,
        hasAudio: doc.hasAudio ?? false,
        promptTemplate: doc.promptTemplate ?? null,
        templateVersion: doc.templateVersion ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'prompts',
    prismaModel: 'prompt',
    pgTable: 'prompts',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      if (!userId) return null;
      // tags M2M — Phase 4
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        original: doc.original ?? doc.content ?? '',
        enhanced: doc.enhanced ?? null,
        category: toPostgresEnum(doc.category as string | undefined | null),
        status:
          toPostgresEnum(doc.status as string | undefined | null) ?? 'DRAFT',
        style: doc.style ?? null,
        mood: doc.mood ?? null,
        camera: doc.camera ?? null,
        scene: doc.scene ?? null,
        fontFamily: doc.fontFamily ?? null,
        model: doc.model ?? null,
        duration: doc.duration ?? null,
        ratio: doc.ratio ?? null,
        resolution: doc.resolution ?? null,
        seed:
          typeof doc.seed === 'number' ? Math.min(doc.seed, 2147483647) : null,
        reference: doc.reference ?? null,
        speech: doc.speech ?? null,
        scope: toPostgresEnum(doc.scope as string | undefined | null) ?? 'USER',
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'folders',
    prismaModel: 'folder',
    pgTable: 'folders',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      if (!userId || !organizationId) return null;
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        label: doc.label ?? '',
        description: doc.description ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'tags',
    prismaModel: 'tag',
    pgTable: 'tags',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        label: doc.label ?? '',
        backgroundColor: doc.color ?? doc.backgroundColor ?? '#3B82F6',
        textColor: doc.textColor ?? '#FFFFFF',
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'bookmarks',
    prismaModel: 'bookmark',
    pgTable: 'bookmarks',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      // tags, extractedIngredients, generatedIngredients — M2M, Phase 4
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        url: doc.url ?? null,
        title: doc.title ?? null,
        description: doc.description ?? null,
        thumbnailUrl: doc.thumbnailUrl ?? null,
        status: toPostgresEnum(doc.status as string | undefined | null),
        data: toJsonSafe(doc.data) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'assets',
    prismaModel: 'asset',
    pgTable: 'assets',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      if (!userId) return null;
      const parentOrgId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const parentBrandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const parentIngredientId = resolveDocRef(
        doc,
        'ingredient',
        idMap,
        'ingredients',
      );
      const parentArticleId = resolveDocRef(doc, 'article', idMap, 'articles');
      return {
        mongoId,
        userId,
        parentOrgId,
        parentBrandId,
        parentIngredientId,
        parentArticleId,
        parentType:
          toPostgresEnum(doc.parentType as string | undefined | null) ??
          'ORGANIZATION',
        category:
          toPostgresEnum(doc.category as string | undefined | null) ?? 'LOGO',
        externalId: doc.externalId ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'links',
    prismaModel: 'link',
    pgTable: 'links',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      if (!brandId) return null;
      return {
        mongoId,
        brandId,
        label: doc.label ?? '',
        category:
          toPostgresEnum(doc.category as string | undefined | null) ?? 'OTHER',
        url: doc.url ?? '',
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'tracked-links',
    prismaModel: 'trackedLink',
    pgTable: 'tracked_links',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const linkId = resolveDocRef(doc, 'link', idMap, 'links');
      const postId = resolveDocRef(doc, 'post', idMap, 'posts');
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        linkId,
        postId,
        clickCount: doc.clickCount ?? 0,
        data: toJsonSafe(doc.data) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'posts',
    prismaModel: 'post',
    pgTable: 'posts',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const credentialId = resolveDocRef(
        doc,
        'credential',
        idMap,
        'credentials',
      );
      if (!userId || !organizationId || !brandId || !credentialId) return null;
      const workflowExecutionId = resolveDocRef(
        doc,
        'workflowExecution',
        idMap,
        'workflow_executions',
      );
      const personaId = resolveDocRef(doc, 'persona', idMap, 'personas');

      // entity ref — could point to ingredient or article depending on entityModel
      let entityIngredientId: string | null = null;
      let entityArticleId: string | null = null;
      if (
        doc.entityModel === 'Ingredient' ||
        doc.entityModel === 'Image' ||
        doc.entityModel === 'Video'
      ) {
        entityIngredientId = resolveDocRef(doc, 'entity', idMap, 'ingredients');
      } else if (doc.entityModel === 'Article') {
        entityArticleId = resolveDocRef(doc, 'entity', idMap, 'articles');
      }

      // ingredients and tags are M2M — handled in Phase 4
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        credentialId,
        workflowExecutionId,
        entityIngredientId,
        entityArticleId,
        entityModel: toPostgresEnum(
          doc.entityModel as string | undefined | null,
        ),
        personaId,
        description: doc.description ?? doc.content ?? doc.caption ?? '',
        platform: toPostgresEnum(doc.platform as string | undefined | null),
        status:
          toPostgresEnum(doc.status as string | undefined | null) ??
          'SCHEDULED',
        label: doc.label ?? null,
        category:
          toPostgresEnum(doc.category as string | undefined | null) ?? 'TEXT',
        scheduledDate: doc.scheduledDate ?? doc.scheduledAt ?? null,
        publishedAt: doc.publishedAt ?? null,
        externalId: doc.externalId ?? null,
        externalShortcode: doc.externalShortcode ?? null,
        url: doc.url ?? doc.externalUrl ?? null,
        reviewDecision: toPostgresEnum(
          doc.reviewDecision as string | undefined | null,
        ),
        reviewEvents: toJsonSafe(doc.reviewEvents) ?? [],
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'analytics',
    mongoCollection: 'post-analytics',
    prismaModel: 'postAnalytics',
    pgTable: 'post_analytics',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const postId = resolveDocRef(doc, 'post', idMap, 'posts');
      if (!userId || !organizationId || !brandId || !postId) return null;
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        postId,
        platform: toPostgresEnum(doc.platform as string | undefined | null),
        date: doc.date ?? doc.recordedAt ?? doc.createdAt,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'schedules',
    prismaModel: 'schedule',
    pgTable: 'schedules',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const credentialId = resolveDocRef(
        doc,
        'credential',
        idMap,
        'credentials',
      );
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        credentialId,
        platform: toPostgresEnum(doc.platform as string | undefined | null),
        cronExpression: doc.cronExpression ?? null,
        timezone: doc.timezone ?? null,
        config: toJsonSafe(doc.config) ?? null,
        isActive: doc.isActive ?? true,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'articles',
    prismaModel: 'article',
    pgTable: 'articles',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      if (!userId || !organizationId) return null;
      // tags M2M — Phase 4
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        title: doc.title ?? '',
        slug: doc.slug ?? null,
        content: doc.content ?? null,
        excerpt: doc.excerpt ?? null,
        coverImageUrl: doc.coverUrl ?? doc.coverImageUrl ?? null,
        status: (() => {
          const s = toPostgresEnum(doc.status as string | undefined | null);
          if (s && ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(s)) return s;
          if (s === 'PUBLIC') return 'PUBLISHED';
          return 'DRAFT';
        })(),
        publishedAt: doc.publishedAt ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'analytics',
    mongoCollection: 'article-analytics',
    prismaModel: 'articleAnalytics',
    pgTable: 'article_analytics',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const articleId = resolveDocRef(doc, 'article', idMap, 'articles');
      return {
        mongoId,
        organizationId,
        brandId,
        articleId,
        data: toJsonSafe(doc.data) ?? null,
        recordedAt: doc.recordedAt ?? doc.createdAt,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'transcripts',
    prismaModel: 'transcript',
    pgTable: 'transcripts',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const ingredientId = resolveDocRef(
        doc,
        'ingredient',
        idMap,
        'ingredients',
      );
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        ingredientId,
        content: doc.content ?? null,
        language: doc.language ?? null,
        provider: toPostgresEnum(doc.provider as string | undefined | null),
        data: toJsonSafe(doc.data) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'trainings',
    prismaModel: 'training',
    pgTable: 'trainings',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      if (!userId || !organizationId) return null;
      // sources M2M (ingredients) — Phase 4
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        label: doc.label ?? null,
        provider: toPostgresEnum(doc.provider as string | undefined | null),
        status:
          toPostgresEnum(doc.status as string | undefined | null) ?? 'PENDING',
        config: toJsonSafe(doc.config) ?? null,
        providerData: toJsonSafe(doc.providerData) ?? null,
        externalId: doc.externalId ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'personas',
    prismaModel: 'persona',
    pgTable: 'personas',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      // avatarIngredient and voiceIngredient are back-filled in Phase 4 via BACKFILL_MAPPINGS
      // credentials, assignedMembers, tags — M2M, Phase 4
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        label: doc.label ?? null,
        handle: doc.handle ?? null,
        description: doc.description ?? null,
        systemPrompt: doc.systemPrompt ?? null,
        config: toJsonSafe(doc.config) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-threads',
    prismaModel: 'agentThread',
    pgTable: 'agent_threads',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      return {
        mongoId,
        userId,
        organizationId,
        title: doc.title ?? null,
        config: toJsonSafe(doc.config) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-messages',
    prismaModel: 'agentMessage',
    pgTable: 'agent_messages',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      // room or thread field both map to threadId
      const threadId =
        resolveDocRef(doc, 'room', idMap, 'agent_threads') ??
        resolveDocRef(doc, 'thread', idMap, 'agent_threads');
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        threadId,
        organizationId,
        userId,
        brandId,
        role: doc.role ?? null,
        content: doc.content ?? null,
        toolCalls: toJsonSafe(doc.toolCalls) ?? null,
        toolResults: toJsonSafe(doc.toolResults) ?? null,
        metadata: toJsonSafe(doc.metadata) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'workflows',
    prismaModel: 'workflow',
    pgTable: 'workflows',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      if (!userId || !organizationId) return null;
      // brands and tags M2M — Phase 4
      return {
        mongoId,
        organizationId,
        userId,
        label: doc.label ?? null,
        description: doc.description ?? null,
        config: toJsonSafe(doc.definition ?? doc.config) ?? {},
        status: (() => {
          const s = toPostgresEnum(doc.status as string | undefined | null);
          if (s && ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'].includes(s))
            return s;
          if (s === 'COMPLETED' || s === 'PUBLISHED') return 'ARCHIVED';
          return 'DRAFT';
        })(),
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'workflow-executions',
    prismaModel: 'workflowExecution',
    pgTable: 'workflow_executions',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const workflowId = resolveDocRef(doc, 'workflow', idMap, 'workflows');
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        workflowId,
        status:
          toPostgresEnum(doc.status as string | undefined | null) ?? 'PENDING',
        context: toJsonSafe(doc.context) ?? null,
        result: toJsonSafe(doc.result) ?? null,
        error: doc.error ?? null,
        startedAt: doc.startedAt ?? null,
        completedAt: doc.completedAt ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'tasks',
    prismaModel: 'task',
    pgTable: 'tasks',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      if (!organizationId) return null;
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        title: doc.title ?? null,
        description: doc.description ?? null,
        status: (() => {
          const s = toPostgresEnum(doc.status as string | undefined | null);
          if (
            s &&
            [
              'BACKLOG',
              'TODO',
              'IN_PROGRESS',
              'IN_REVIEW',
              'DONE',
              'CANCELLED',
            ].includes(s)
          )
            return s;
          if (s === 'PENDING') return 'TODO';
          if (s === 'COMPLETED') return 'DONE';
          return 'TODO';
        })(),
        priority:
          toPostgresEnum(doc.priority as string | undefined | null) ?? 'MEDIUM',
        config: toJsonSafe(doc.data ?? doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'bots',
    prismaModel: 'bot',
    pgTable: 'bots',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const credentialId = resolveDocRef(
        doc,
        'credential',
        idMap,
        'credentials',
      );
      const personaId = resolveDocRef(doc, 'persona', idMap, 'personas');
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        credentialId,
        personaId,
        label: doc.label ?? null,
        platform: toPostgresEnum(doc.platform as string | undefined | null),
        config: toJsonSafe(doc.config) ?? null,
        isActive: doc.isActive ?? false,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'outreach-campaigns',
    prismaModel: 'outreachCampaign',
    pgTable: 'outreach_campaigns',
    phase: 3,
    transform: createSimpleTransform({
      jsonFields: ['config', 'data'],
      enumFields: { status: 'DRAFT' },
    }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'presets',
    prismaModel: 'preset',
    pgTable: 'presets',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        organizationId,
        brandId,
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'captions',
    prismaModel: 'caption',
    pgTable: 'captions',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const ingredientId = resolveDocRef(
        doc,
        'ingredient',
        idMap,
        'ingredients',
      );
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        ingredientId,
        content: doc.content ?? null,
        language: doc.language ?? null,
        provider: toPostgresEnum(doc.provider as string | undefined | null),
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'clips',
    mongoCollection: 'clip-projects',
    prismaModel: 'clipProject',
    pgTable: 'clip_projects',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const ingredientId = resolveDocRef(
        doc,
        'ingredient',
        idMap,
        'ingredients',
      );
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        ingredientId,
        label: doc.label ?? null,
        status:
          toPostgresEnum(doc.status as string | undefined | null) ?? 'PENDING',
        config: toJsonSafe(doc.config) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'clips',
    mongoCollection: 'clip-results',
    prismaModel: 'clipResult',
    pgTable: 'clip_results',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const clipProjectId = resolveDocRef(
        doc,
        'clipProject',
        idMap,
        'clip_projects',
      );
      const ingredientId = resolveDocRef(
        doc,
        'ingredient',
        idMap,
        'ingredients',
      );
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        clipProjectId,
        ingredientId,
        score: doc.score ?? null,
        data: toJsonSafe(doc.data) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'templates',
    prismaModel: 'template',
    pgTable: 'templates',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const _brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const _userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        organizationId,
        label: doc.label ?? null,
        config: toJsonSafe(doc.content ?? doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'template-metadata',
    prismaModel: 'templateMetadata',
    pgTable: 'template_metadata',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const templateId = resolveDocRef(doc, 'template', idMap, 'templates');
      if (!templateId) return null;
      return {
        mongoId,
        templateId,
        data: toJsonSafe(doc.data) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'votes',
    prismaModel: 'vote',
    pgTable: 'votes',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        organizationId,
        userId,
        targetId: doc.targetId ?? null,
        targetModel: doc.targetModel ?? null,
        value: doc.value ?? 1,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'watchlists',
    prismaModel: 'watchlist',
    pgTable: 'watchlists',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['config'] }),
  },

  // element-blacklists (cloud.element-blacklists and possibly cloud.elements)
  {
    mongoDb: 'cloud',
    mongoCollection: 'elements-blacklists',
    prismaModel: 'elementBlacklist',
    pgTable: 'elements_blacklists',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'elements-cameras',
    prismaModel: 'elementCamera',
    pgTable: 'elements_cameras',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'elements-camera-movements',
    prismaModel: 'elementCameraMovement',
    pgTable: 'elements_camera_movements',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'elements-lenses',
    prismaModel: 'elementLens',
    pgTable: 'elements_lenses',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'elements-lightings',
    prismaModel: 'elementLighting',
    pgTable: 'elements_lightings',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'elements-moods',
    prismaModel: 'elementMood',
    pgTable: 'elements_moods',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'elements-scenes',
    prismaModel: 'elementScene',
    pgTable: 'elements_scenes',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'elements-sounds',
    prismaModel: 'elementSound',
    pgTable: 'elements_sounds',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'elements-styles',
    prismaModel: 'elementStyle',
    pgTable: 'elements_styles',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'font-families',
    prismaModel: 'fontFamilyRecord',
    pgTable: 'font_families',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      return {
        mongoId,
        organizationId,
        key: doc.slug ?? doc.key ?? null,
        label: doc.label ?? null,
        description: doc.description ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'trends',
    prismaModel: 'trend',
    pgTable: 'trends',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'trending-hashtags',
    prismaModel: 'trendingHashtag',
    pgTable: 'trending_hashtags',
    phase: 3,
    transform: (doc, _idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      return {
        mongoId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'trending-sounds',
    prismaModel: 'trendingSound',
    pgTable: 'trending_sounds',
    phase: 3,
    transform: (doc, _idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      return {
        mongoId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'trending-videos',
    prismaModel: 'trendingVideo',
    pgTable: 'trending_videos',
    phase: 3,
    transform: (doc, _idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      return {
        mongoId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'trend-preferences',
    prismaModel: 'trendPreferences',
    pgTable: 'trend_preferences',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        platforms: Array.isArray(doc.platforms)
          ? (doc.platforms as string[])
              .map((p) => toPostgresEnum(p))
              .filter(Boolean)
          : [],
        categories: Array.isArray(doc.categories)
          ? (doc.categories as string[])
          : [],
        data: toJsonSafe(doc.data) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'customers',
    prismaModel: 'customer',
    pgTable: 'customers',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      if (!organizationId) return null;
      return {
        mongoId,
        organizationId,
        stripeCustomerId: doc.stripeCustomerId ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'subscriptions',
    prismaModel: 'subscription',
    pgTable: 'subscriptions',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const customerId = resolveDocRef(doc, 'customer', idMap, 'customers');
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      if (!userId || !organizationId) return null;
      return {
        mongoId,
        customerId,
        organizationId,
        userId,
        stripeSubscriptionId: doc.stripeSubscriptionId ?? null,
        stripePriceId: doc.stripePriceId ?? null,
        status: toPostgresEnum(doc.status as string | undefined | null),
        currentPeriodStart: doc.currentPeriodStart ?? null,
        currentPeriodEnd: doc.currentPeriodEnd ?? null,
        plan: doc.plan ?? null,
        cancelAtPeriodEnd: doc.cancelAtPeriodEnd ?? doc.canceledAt != null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'user-subscriptions',
    prismaModel: 'userSubscription',
    pgTable: 'user_subscriptions',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const subscriptionId = resolveDocRef(
        doc,
        'subscription',
        idMap,
        'subscriptions',
      );
      return {
        mongoId,
        userId,
        subscriptionId,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'subscription-attributions',
    prismaModel: 'subscriptionAttribution',
    pgTable: 'subscription_attributions',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const subscriptionId = resolveDocRef(
        doc,
        'subscription',
        idMap,
        'subscriptions',
      );
      return {
        mongoId,
        userId,
        subscriptionId,
        source: toPostgresEnum(doc.source as string | undefined | null),
        data: toJsonSafe(doc.data) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'credit-balances',
    prismaModel: 'creditBalance',
    pgTable: 'credit_balances',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      if (!organizationId) return null;
      return {
        mongoId,
        organizationId,
        balance: doc.balance ?? 0,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'credit-transactions',
    prismaModel: 'creditTransaction',
    pgTable: 'credit_transactions',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      if (!organizationId) return null;
      return {
        mongoId,
        organizationId,
        amount: doc.amount ?? 0,
        balanceAfter: doc.balanceAfter ?? null,
        source: doc.source ?? null,
        description: doc.description ?? null,
        referenceId: doc.referenceId ?? null,
        referenceType: doc.referenceType ?? null,
        metadata: toJsonSafe(doc.data ?? doc.metadata) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'auth',
    mongoCollection: 'profiles',
    prismaModel: 'profile',
    pgTable: 'profiles',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        userId,
        bio: doc.bio ?? null,
        website: doc.website ?? null,
        location: doc.location ?? null,
        data: toJsonSafe(doc.data) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'analytics',
    mongoCollection: 'analytics',
    prismaModel: 'analytic',
    pgTable: 'analytics',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'analytics',
    mongoCollection: 'forecasts',
    prismaModel: 'forecast',
    pgTable: 'forecasts',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'analytics',
    mongoCollection: 'insights',
    prismaModel: 'insight',
    pgTable: 'insights',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'evaluations',
    prismaModel: 'evaluation',
    pgTable: 'evaluations',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      if (!organizationId || !userId) return null;
      return {
        mongoId,
        organizationId,
        userId,
        contentType: doc.contentType ?? null,
        contentId: doc.contentId ?? null,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'activities',
    prismaModel: 'activity',
    pgTable: 'activities',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        organizationId,
        userId,
        brandId,
        action: doc.action ?? null,
        entityId: doc.targetId ?? doc.entityId ?? null,
        entityModel: doc.targetModel ?? doc.entityModel ?? null,
        data: toJsonSafe(doc.data) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-strategies',
    prismaModel: 'agentStrategy',
    pgTable: 'agent_strategies',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const goalId = resolveDocRef(doc, 'goal', idMap, 'tasks');
      return {
        mongoId,
        organizationId,
        userId,
        brandId,
        goalId,
        label: doc.label ?? null,
        config: toJsonSafe(doc.config) ?? null,
        policies: toJsonSafe(doc.policies) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'context-bases',
    prismaModel: 'contextBase',
    pgTable: 'context_bases',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        label: doc.label ?? null,
        description: doc.description ?? null,
        config: toJsonSafe(doc.config) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'context-entries',
    prismaModel: 'contextEntry',
    pgTable: 'context_entries',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const contextBaseId = resolveDocRef(
        doc,
        'knowledgeBase',
        idMap,
        'context_bases',
      );
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        contextBaseId,
        content: doc.content ?? null,
        embedding: toJsonSafe(doc.embedding) ?? null,
        metadata: toJsonSafe(doc.metadata) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'fanvue',
    mongoCollection: 'fanvue-content',
    prismaModel: 'fanvueContent',
    pgTable: 'fanvue_content',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'fanvue',
    mongoCollection: 'fanvue-earnings',
    prismaModel: 'fanvueEarnings',
    pgTable: 'fanvue_earnings',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'fanvue',
    mongoCollection: 'fanvue-schedules',
    prismaModel: 'fanvueSchedule',
    pgTable: 'fanvue_schedules',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'fanvue',
    mongoCollection: 'fanvue-subscribers',
    prismaModel: 'fanvueSubscriber',
    pgTable: 'fanvue_subscribers',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'crm',
    mongoCollection: 'leads',
    prismaModel: 'lead',
    pgTable: 'leads',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        email: doc.email ?? null,
        name: doc.name ?? null,
        platform: toPostgresEnum(doc.platform as string | undefined | null),
        externalId: doc.externalId ?? null,
        status: toPostgresEnum(doc.status as string | undefined | null),
        data: toJsonSafe(doc.data) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  // ---- Agent collections (remaining) ----

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-runs',
    prismaModel: 'agentRun',
    pgTable: 'agent_runs',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const strategyId = resolveDocRef(
        doc,
        'strategy',
        idMap,
        'agent_strategies',
      );
      const threadId = resolveDocRef(doc, 'thread', idMap, 'agent_threads');
      const parentRunId = resolveDocRef(doc, 'parentRun', idMap, 'agent_runs');
      return {
        mongoId,
        organizationId,
        userId,
        strategyId,
        threadId,
        parentRunId,
        status:
          toPostgresEnum(doc.status as string | undefined | null) ?? 'PENDING',
        type: doc.type ?? null,
        config: toJsonSafe(doc.config) ?? {},
        result: toJsonSafe(doc.result) ?? null,
        error: doc.error ?? null,
        startedAt: doc.startedAt ?? null,
        completedAt: doc.completedAt ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-goals',
    prismaModel: 'agentGoal',
    pgTable: 'agent_goals',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        organizationId,
        userId,
        brandId,
        label: doc.label ?? null,
        description: doc.description ?? null,
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-memories',
    prismaModel: 'agentMemory',
    pgTable: 'agent_memories',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const campaignId = resolveDocRef(
        doc,
        'campaign',
        idMap,
        'agent_campaigns',
      );
      return {
        mongoId,
        organizationId,
        userId,
        brandId,
        campaignId,
        content: doc.content ?? null,
        type: doc.type ?? null,
        metadata: toJsonSafe(doc.metadata) ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-campaigns',
    prismaModel: 'agentCampaign',
    pgTable: 'agent_campaigns',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const campaignLeadStrategyId = resolveDocRef(
        doc,
        'campaignLeadStrategy',
        idMap,
        'agent_strategies',
      );
      return {
        mongoId,
        organizationId,
        userId,
        brandId,
        campaignLeadStrategyId,
        label: doc.label ?? null,
        description: doc.description ?? null,
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-strategy-opportunities',
    prismaModel: 'agentStrategyOpportunity',
    pgTable: 'agent_strategy_opportunities',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const strategyId = resolveDocRef(
        doc,
        'strategy',
        idMap,
        'agent_strategies',
      );
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        strategyId,
        organizationId,
        brandId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-strategy-reports',
    prismaModel: 'agentStrategyReport',
    pgTable: 'agent_strategy_reports',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const strategyId = resolveDocRef(
        doc,
        'strategy',
        idMap,
        'agent_strategies',
      );
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        strategyId,
        organizationId,
        brandId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-thread-events',
    prismaModel: 'agentThreadEvent',
    pgTable: 'agent_thread_events',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const threadId = resolveDocRef(doc, 'thread', idMap, 'agent_threads');
      return {
        mongoId,
        organizationId,
        threadId,
        sequence: doc.sequence ?? 0,
        commandId: doc.commandId ?? null,
        runId: doc.runId ?? null,
        type: doc.type ?? null,
        data: toJsonSafe(doc.data) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-thread-snapshots',
    prismaModel: 'agentThreadSnapshot',
    pgTable: 'agent_thread_snapshots',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const threadId = resolveDocRef(doc, 'thread', idMap, 'agent_threads');
      return {
        mongoId,
        organizationId,
        threadId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'agent-workflows',
    prismaModel: 'agentWorkflow',
    pgTable: 'agent_workflows',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        organizationId,
        userId,
        label: doc.label ?? null,
        description: doc.description ?? null,
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'agent',
    mongoCollection: 'thread-context-states',
    prismaModel: 'threadContextState',
    pgTable: 'thread_context_states',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const threadId = resolveDocRef(doc, 'thread', idMap, 'agent_threads');
      return {
        mongoId,
        organizationId,
        threadId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  // ---- Cloud collections (remaining) ----

  {
    mongoDb: 'cloud',
    mongoCollection: 'brand-memory',
    prismaModel: 'brandMemory',
    pgTable: 'brand_memories',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        organizationId,
        brandId,
        content: doc.content ?? null,
        type: doc.type ?? null,
        metadata: toJsonSafe(doc.metadata) ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'content-runs',
    prismaModel: 'contentRun',
    pgTable: 'content_runs',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        organizationId,
        brandId,
        config: toJsonSafe(doc.config) ?? {},
        status: doc.status ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'batch-workflow-jobs',
    prismaModel: 'batchWorkflowJob',
    pgTable: 'batch_workflow_jobs',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const workflowId = resolveDocRef(doc, 'workflow', idMap, 'workflows');
      return {
        mongoId,
        organizationId,
        userId,
        workflowId,
        items: toJsonSafe(doc.items) ?? {},
        status:
          toPostgresEnum(doc.status as string | undefined | null) ?? 'PENDING',
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'content-schedules',
    prismaModel: 'contentSchedule',
    pgTable: 'content_schedules',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        organizationId,
        brandId,
        config: toJsonSafe(doc.config) ?? {},
        isActive: doc.isActive ?? false,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'distributions',
    prismaModel: 'distribution',
    pgTable: 'distributions',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        organizationId,
        userId,
        brandId,
        config: toJsonSafe(doc.config) ?? {},
        status: doc.status ?? null,
        isActive: doc.isActive ?? false,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'repurposing-jobs',
    prismaModel: 'repurposingJob',
    pgTable: 'repurposing_jobs',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        organizationId,
        userId,
        config: toJsonSafe(doc.config) ?? {},
        status: doc.status ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'content-drafts',
    prismaModel: 'contentDraft',
    pgTable: 'content_drafts',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const contentRunId = resolveDocRef(
        doc,
        'contentRun',
        idMap,
        'content_runs',
      );
      const approvedById = resolveDocRef(doc, 'approvedBy', idMap, 'users');
      return {
        mongoId,
        organizationId,
        brandId,
        contentRunId,
        approvedById,
        status:
          toPostgresEnum(doc.status as string | undefined | null) ?? 'DRAFT',
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'content-plans',
    prismaModel: 'contentPlan',
    pgTable: 'content_plans',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const createdById = resolveDocRef(doc, 'createdBy', idMap, 'users');
      return {
        mongoId,
        organizationId,
        brandId,
        createdById,
        label: doc.label ?? null,
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'content-plan-items',
    prismaModel: 'contentPlanItem',
    pgTable: 'content_plan_items',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const planId = resolveDocRef(doc, 'plan', idMap, 'content_plans');
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      return {
        mongoId,
        organizationId,
        planId,
        brandId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'content-scores',
    prismaModel: 'contentScore',
    pgTable: 'content_scores',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      return {
        mongoId,
        organizationId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'optimizations',
    prismaModel: 'optimization',
    pgTable: 'optimizations',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const scoreId = resolveDocRef(doc, 'score', idMap, 'content_scores');
      return {
        mongoId,
        organizationId,
        userId,
        scoreId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'content-performance',
    prismaModel: 'contentPerformance',
    pgTable: 'content_performance',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const postId = resolveDocRef(doc, 'post', idMap, 'posts');
      const contentRunId = resolveDocRef(
        doc,
        'contentRun',
        idMap,
        'content_runs',
      );
      return {
        mongoId,
        organizationId,
        brandId,
        userId: doc.userId ?? null,
        postId,
        contentRunId,
        workflowExecutionId: doc.workflowExecutionId ?? null,
        platform: doc.platform ?? null,
        variantId: doc.variantId ?? null,
        generationId: doc.generationId ?? null,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'content-patterns',
    prismaModel: 'contentPattern',
    pgTable: 'content_patterns',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const sourceCreatorId = resolveDocRef(
        doc,
        'sourceCreator',
        idMap,
        'creator_analyses',
      );
      return {
        mongoId,
        organizationId,
        sourceCreatorId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'creator-analyses',
    prismaModel: 'creatorAnalysis',
    pgTable: 'creator_analyses',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const createdById = resolveDocRef(doc, 'createdBy', idMap, 'users');
      return {
        mongoId,
        organizationId,
        createdById,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'pattern-playbooks',
    prismaModel: 'patternPlaybook',
    pgTable: 'pattern_playbooks',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      return {
        mongoId,
        organizationId,
        createdById: doc.createdById ?? null,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'creative-patterns',
    prismaModel: 'creativePattern',
    pgTable: 'creative_patterns',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'bot-activities',
    prismaModel: 'botActivity',
    pgTable: 'bot_activities',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const replyBotConfigId = resolveDocRef(
        doc,
        'replyBotConfig',
        idMap,
        'reply_bot_configs',
      );
      const monitoredAccountId = resolveDocRef(
        doc,
        'monitoredAccount',
        idMap,
        'monitored_accounts',
      );
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        replyBotConfigId,
        monitoredAccountId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'reply-bot-configs',
    prismaModel: 'replyBotConfig',
    pgTable: 'reply_bot_configs',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        organizationId,
        brandId: doc.brandId ?? null,
        userId,
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'monitored-accounts',
    prismaModel: 'monitoredAccount',
    pgTable: 'monitored_accounts',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const credentialId = resolveDocRef(
        doc,
        'credential',
        idMap,
        'credentials',
      );
      const botConfigId = resolveDocRef(
        doc,
        'botConfig',
        idMap,
        'reply_bot_configs',
      );
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        credentialId,
        botConfigId,
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'processed-tweets',
    prismaModel: 'processedTweet',
    pgTable: 'processed_tweets',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const replyBotConfigId = resolveDocRef(
        doc,
        'replyBotConfig',
        idMap,
        'reply_bot_configs',
      );
      const monitoredAccountId = resolveDocRef(
        doc,
        'monitoredAccount',
        idMap,
        'monitored_accounts',
      );
      return {
        mongoId,
        organizationId,
        replyBotConfigId,
        botActivityId: doc.botActivityId ?? null,
        monitoredAccountId,
        tweetId: doc.tweetId ?? '',
        processedBy: doc.processedBy ?? null,
        processedAt: doc.processedAt ?? doc.createdAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'campaign-targets',
    prismaModel: 'campaignTarget',
    pgTable: 'campaign_targets',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const campaignId = resolveDocRef(
        doc,
        'campaign',
        idMap,
        'outreach_campaigns',
      );
      return {
        mongoId,
        organizationId,
        campaignId,
        status:
          toPostgresEnum(doc.status as string | undefined | null) ?? 'PENDING',
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'skills',
    prismaModel: 'skill',
    pgTable: 'skills',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      return {
        mongoId,
        organizationId,
        label: doc.label ?? null,
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'skill-receipts',
    prismaModel: 'skillReceipt',
    pgTable: 'skill_receipts',
    phase: 3,
    transform: (doc) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      return {
        mongoId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'template-usages',
    prismaModel: 'templateUsage',
    pgTable: 'template_usages',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const templateId = resolveDocRef(doc, 'template', idMap, 'templates');
      return {
        mongoId,
        organizationId,
        userId,
        templateId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'editor-projects',
    prismaModel: 'editorProject',
    pgTable: 'editor_projects',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const renderedVideoId = resolveDocRef(
        doc,
        'renderedVideo',
        idMap,
        'ingredients',
      );
      return {
        mongoId,
        organizationId,
        brandId,
        userId,
        renderedVideoId,
        tracks: toJsonSafe(doc.tracks) ?? {},
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'announcements',
    prismaModel: 'announcement',
    pgTable: 'announcements',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      return {
        mongoId,
        organizationId,
        title: doc.title ?? null,
        content: doc.content ?? null,
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'goals',
    prismaModel: 'goal',
    pgTable: 'goals',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const parentId = resolveDocRef(doc, 'parent', idMap, 'goals');
      return {
        mongoId,
        organizationId,
        parentId,
        label: doc.label ?? null,
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'streaks',
    prismaModel: 'streak',
    pgTable: 'streaks',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        organizationId,
        userId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'batches',
    prismaModel: 'batch',
    pgTable: 'batches',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      if (!organizationId || !userId) return null;
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const agentStrategyId = resolveDocRef(
        doc,
        'agentStrategy',
        idMap,
        'agent_strategies',
      );
      return {
        mongoId,
        organizationId,
        userId,
        brandId,
        agentStrategyId,
        items: toJsonSafe(doc.items) ?? [],
        status: (() => {
          const s = toPostgresEnum(doc.status as string | undefined | null);
          if (s && ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(s))
            return s;
          if (s === 'GENERATING' || s === 'IN_PROGRESS') return 'PROCESSING';
          return 'PENDING';
        })(),
        config: toJsonSafe(doc.config) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'runs',
    prismaModel: 'run',
    pgTable: 'runs',
    phase: 3,
    transform: (doc) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      return {
        mongoId,
        organizationId:
          doc.organizationId ??
          (doc.organization as { toString(): string })?.toString() ??
          '',
        brandId:
          doc.brandId ??
          (doc.brand as { toString(): string })?.toString() ??
          null,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'cron-jobs',
    prismaModel: 'cronJob',
    pgTable: 'cron_jobs',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        organizationId,
        userId,
        label: doc.label ?? null,
        expression: doc.expression ?? null,
        config: toJsonSafe(doc.config) ?? {},
        status:
          toPostgresEnum(doc.status as string | undefined | null) ?? 'ACTIVE',
        lastRunAt: doc.lastRunAt ?? null,
        nextRunAt: doc.nextRunAt ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'cron-runs',
    prismaModel: 'cronRun',
    pgTable: 'cron_runs',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const cronJobId = resolveDocRef(doc, 'cronJob', idMap, 'cron_jobs');
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      return {
        mongoId,
        cronJobId,
        organizationId,
        userId,
        status:
          toPostgresEnum(doc.status as string | undefined | null) ?? 'PENDING',
        result: toJsonSafe(doc.result) ?? null,
        error: doc.error ?? null,
        startedAt: doc.startedAt ?? null,
        completedAt: doc.completedAt ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'task-comments',
    prismaModel: 'taskComment',
    pgTable: 'task_comments',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const taskId = resolveDocRef(doc, 'task', idMap, 'tasks');
      return {
        mongoId,
        organizationId,
        taskId,
        content: doc.content ?? null,
        authorId: doc.authorId ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'task-counters',
    prismaModel: 'taskCounter',
    pgTable: 'task_counters',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      return {
        mongoId,
        organizationId,
        counter: doc.counter ?? 0,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'newsletters',
    prismaModel: 'newsletter',
    pgTable: 'newsletters',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const userId = resolveDocRef(doc, 'user', idMap, 'users');
      const organizationId = resolveDocRef(
        doc,
        'organization',
        idMap,
        'organizations',
      );
      const brandId = resolveDocRef(doc, 'brand', idMap, 'brands');
      const agentRunId = resolveDocRef(doc, 'agentRun', idMap, 'agent_runs');
      const approvedByUserId = resolveDocRef(
        doc,
        'approvedByUser',
        idMap,
        'users',
      );
      const publishedByUserId = resolveDocRef(
        doc,
        'publishedByUser',
        idMap,
        'users',
      );
      return {
        mongoId,
        userId,
        organizationId,
        brandId,
        agentRunId,
        approvedByUserId,
        publishedByUserId,
        title: doc.title ?? '',
        content: doc.content ?? null,
        status:
          toPostgresEnum(doc.status as string | undefined | null) ?? 'DRAFT',
        scheduledAt: doc.scheduledAt ?? null,
        sentAt: doc.sentAt ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'customer-instances',
    prismaModel: 'customerInstance',
    pgTable: 'customer_instances',
    phase: 3,
    transform: (doc) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      return {
        mongoId,
        organizationId: doc.organizationId ?? null,
        config: toJsonSafe(doc.config) ?? {},
        status: doc.status ?? null,
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'link-clicks',
    prismaModel: 'linkClick',
    pgTable: 'link_clicks',
    phase: 3,
    transform: (doc, idMap) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      const linkId = resolveDocRef(doc, 'link', idMap, 'tracked_links');
      return {
        mongoId,
        linkId,
        timestamp: doc.timestamp ?? doc.createdAt,
        sessionId: doc.sessionId ?? '',
        isUnique: doc.isUnique ?? false,
        referrer: doc.referrer ?? null,
        userAgent: doc.userAgent ?? null,
        country: doc.country ?? null,
        device: doc.device ?? null,
        gaClientId: doc.gaClientId ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'livestream-bot-sessions',
    prismaModel: 'livestreamBotSession',
    pgTable: 'livestream_bot_sessions',
    phase: 3,
    transform: (doc) => {
      const mongoId = (doc._id as { toString(): string }).toString();
      return {
        mongoId,
        data: toJsonSafe(doc.data) ?? {},
        isDeleted: doc.isDeleted ?? false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    },
  },

  // ---- Ad collections ----

  {
    mongoDb: 'cloud',
    mongoCollection: 'ad-bulk-upload-jobs',
    prismaModel: 'adBulkUploadJob',
    pgTable: 'ad_bulk_upload_jobs',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data', 'config'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'ad-creative-mappings',
    prismaModel: 'adCreativeMapping',
    pgTable: 'ad_creative_mappings',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'ad-insights',
    prismaModel: 'adInsights',
    pgTable: 'ad_insights',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'ad-optimization-audit-logs',
    prismaModel: 'adOptimizationAuditLog',
    pgTable: 'ad_optimization_audit_logs',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'ad-optimization-configs',
    prismaModel: 'adOptimizationConfig',
    pgTable: 'ad_optimization_configs',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data', 'config'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'ad-optimization-recommendations',
    prismaModel: 'adOptimizationRecommendation',
    pgTable: 'ad_optimization_recommendations',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'ad-performance',
    prismaModel: 'adPerformance',
    pgTable: 'ad_performance',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  // ---- Trend collections (remaining) ----

  {
    mongoDb: 'cloud',
    mongoCollection: 'trend-remix-lineages',
    prismaModel: 'trendRemixLineage',
    pgTable: 'trend_remix_lineages',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'trend-source-references',
    prismaModel: 'trendSourceReference',
    pgTable: 'trend_source_references',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'trend-source-reference-links',
    prismaModel: 'trendSourceReferenceLink',
    pgTable: 'trend_source_reference_links',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },

  {
    mongoDb: 'cloud',
    mongoCollection: 'trend-source-reference-snapshots',
    prismaModel: 'trendSourceReferenceSnapshot',
    pgTable: 'trend_source_reference_snapshots',
    phase: 3,
    transform: createSimpleTransform({ jsonFields: ['data'] }),
  },
];

// ---------------------------------------------------------------------------
// Phase 4 — Join table mappings (populated by main ETL script)
// ---------------------------------------------------------------------------

export const JOIN_TABLE_MAPPINGS: JoinTableMapping[] = [
  // Post M2M
  {
    mongoDb: 'cloud',
    mongoCollection: 'posts',
    mongoField: 'ingredients',
    joinTable: '_post_ingredients',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'posts',
    rightPgTable: 'ingredients',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'posts',
    mongoField: 'tags',
    joinTable: '_post_tags',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'posts',
    rightPgTable: 'tags',
  },
  // Ingredient M2M
  {
    mongoDb: 'cloud',
    mongoCollection: 'ingredients',
    mongoField: 'sources',
    joinTable: '_ingredient_sources',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'ingredients',
    rightPgTable: 'ingredients',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'ingredients',
    mongoField: 'tags',
    joinTable: '_ingredient_tags',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'ingredients',
    rightPgTable: 'tags',
  },
  // Credential M2M
  {
    mongoDb: 'cloud',
    mongoCollection: 'credentials',
    mongoField: 'tags',
    joinTable: '_credential_tags',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'credentials',
    rightPgTable: 'tags',
  },
  // Article M2M
  {
    mongoDb: 'cloud',
    mongoCollection: 'articles',
    mongoField: 'tags',
    joinTable: '_article_tags',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'articles',
    rightPgTable: 'tags',
  },
  // Prompt M2M
  {
    mongoDb: 'cloud',
    mongoCollection: 'prompts',
    mongoField: 'tags',
    joinTable: '_prompt_tags',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'prompts',
    rightPgTable: 'tags',
  },
  // Persona M2M
  {
    mongoDb: 'cloud',
    mongoCollection: 'personas',
    mongoField: 'tags',
    joinTable: '_persona_tags',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'personas',
    rightPgTable: 'tags',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'personas',
    mongoField: 'credentials',
    joinTable: '_persona_credentials',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'personas',
    rightPgTable: 'credentials',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'personas',
    mongoField: 'assignedMembers',
    joinTable: '_persona_assigned_members',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'personas',
    rightPgTable: 'users',
  },
  // Workflow M2M
  {
    mongoDb: 'cloud',
    mongoCollection: 'workflows',
    mongoField: 'tags',
    joinTable: '_workflow_tags',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'workflows',
    rightPgTable: 'tags',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'workflows',
    mongoField: 'brands',
    joinTable: '_workflow_brands',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'workflows',
    rightPgTable: 'brands',
  },
  // Bookmark M2M
  {
    mongoDb: 'cloud',
    mongoCollection: 'bookmarks',
    mongoField: 'tags',
    joinTable: '_bookmark_tags',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'bookmarks',
    rightPgTable: 'tags',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'bookmarks',
    mongoField: 'extractedIngredients',
    joinTable: '_bookmark_extracted',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'bookmarks',
    rightPgTable: 'ingredients',
  },
  {
    mongoDb: 'cloud',
    mongoCollection: 'bookmarks',
    mongoField: 'generatedIngredients',
    joinTable: '_bookmark_generated',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'bookmarks',
    rightPgTable: 'ingredients',
  },
  // Folder M2M
  {
    mongoDb: 'cloud',
    mongoCollection: 'folders',
    mongoField: 'tags',
    joinTable: '_folder_tags',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'folders',
    rightPgTable: 'tags',
  },
  // Member M2M
  {
    mongoDb: 'auth',
    mongoCollection: 'members',
    mongoField: 'brands',
    joinTable: '_member_brands',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'members',
    rightPgTable: 'brands',
  },
  // Training M2M
  {
    mongoDb: 'cloud',
    mongoCollection: 'trainings',
    mongoField: 'sources',
    joinTable: '_training_sources',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'trainings',
    rightPgTable: 'ingredients',
  },
  // AgentCampaign M2M
  {
    mongoDb: 'agent',
    mongoCollection: 'agent-campaigns',
    mongoField: 'agents',
    joinTable: '_campaign_agents',
    leftColumn: 'A',
    rightColumn: 'B',
    leftPgTable: 'agent_campaigns',
    rightPgTable: 'agent_strategies',
  },
];

// ---------------------------------------------------------------------------
// Cross-phase FK back-fills
// ---------------------------------------------------------------------------

export const BACKFILL_MAPPINGS: BackfillMapping[] = [
  {
    pgTable: 'brands',
    fkColumn: 'voiceIngredientId',
    refPgTable: 'ingredients',
    mongoField: 'voiceIngredient',
    mongoDb: 'cloud',
    mongoCollection: 'brands',
  },
  {
    pgTable: 'brands',
    fkColumn: 'musicIngredientId',
    refPgTable: 'ingredients',
    mongoField: 'musicIngredient',
    mongoDb: 'cloud',
    mongoCollection: 'brands',
  },
  {
    pgTable: 'personas',
    fkColumn: 'avatarIngredientId',
    refPgTable: 'ingredients',
    mongoField: 'avatarIngredient',
    mongoDb: 'cloud',
    mongoCollection: 'personas',
  },
  {
    pgTable: 'personas',
    fkColumn: 'voiceIngredientId',
    refPgTable: 'ingredients',
    mongoField: 'voiceIngredient',
    mongoDb: 'cloud',
    mongoCollection: 'personas',
  },
  {
    pgTable: 'models',
    fkColumn: 'trainingId',
    refPgTable: 'trainings',
    mongoField: 'training',
    mongoDb: 'cloud',
    mongoCollection: 'models',
  },
  {
    pgTable: 'models',
    fkColumn: 'parentModelId',
    refPgTable: 'models',
    mongoField: 'parentModel',
    mongoDb: 'cloud',
    mongoCollection: 'models',
  },
];
