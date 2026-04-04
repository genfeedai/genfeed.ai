/**
 * Normalize agent collection names and indexes to the canonical hyphenated
 * `agent-*` naming used by the current API models.
 *
 * Dry run by default. Pass `--live` to apply changes.
 *
 * This script:
 * 1. Renames legacy underscore or simplified collections to their canonical
 *    hyphenated `agent-*` names.
 * 2. Drops empty legacy duplicates when the canonical target already exists.
 * 3. Reconciles each surviving collection to the canonical index set.
 *
 * It intentionally does not rewrite document payload types. Mixed `string` vs
 * `ObjectId` tenant/user references need a separate data migration.
 */

import { runScript } from '@api-scripts/db/connection';
import { deepEqual, parseArgs } from '@api-scripts/db/seed-utils';
import type { Collection, Db, Document, IndexDescription } from 'mongodb';

const logger = {
  log: (...args: unknown[]) => console.log(...args),
};

type IndexDirection = 1 | -1;

interface CanonicalIndexDefinition {
  key: Record<string, IndexDirection>;
  name: string;
  partialFilterExpression?: Document;
  unique?: boolean;
}

interface CollectionPlan {
  indexes: CanonicalIndexDefinition[];
  legacyNames: string[];
  mergeStrategy?: 'organizationThread';
  targetName: string;
}

interface MigrationSummary {
  collectionsDropped: string[];
  collectionsRenamed: Array<{ from: string; to: string }>;
  collectionsSkipped: string[];
  indexesCreated: Array<{ collection: string; name: string }>;
  indexesDropped: Array<{ collection: string; name: string }>;
}

const COLLECTION_PLANS: CollectionPlan[] = [
  {
    indexes: [
      {
        key: {
          isActive: 1,
          isDeleted: 1,
          isEnabled: 1,
          nextRunAt: 1,
          organization: 1,
        },
        name: 'isActive_1_isDeleted_1_isEnabled_1_nextRunAt_1_organization_1',
        partialFilterExpression: { isDeleted: false },
      },
      {
        key: { isDeleted: 1, organization: 1 },
        name: 'isDeleted_1_organization_1',
        partialFilterExpression: { isDeleted: false },
      },
    ],
    legacyNames: ['agent_strategies', 'strategies'],
    targetName: 'agent-strategies',
  },
  {
    indexes: [
      {
        key: { createdAt: -1, isDeleted: 1, organization: 1, strategy: 1 },
        name: 'createdAt_-1_isDeleted_1_organization_1_strategy_1',
        partialFilterExpression: { isDeleted: false },
      },
      {
        key: { expiresAt: 1, isDeleted: 1, status: 1 },
        name: 'expiresAt_1_isDeleted_1_status_1',
        partialFilterExpression: { isDeleted: false },
      },
    ],
    legacyNames: ['agent_strategy_opportunities', 'strategy_opportunities'],
    targetName: 'agent-strategy-opportunities',
  },
  {
    indexes: [
      {
        key: { isDeleted: 1, organization: 1, periodEnd: -1, strategy: 1 },
        name: 'isDeleted_1_organization_1_periodEnd_-1_strategy_1',
        partialFilterExpression: { isDeleted: false },
      },
    ],
    legacyNames: ['agent_strategy_reports', 'strategy_reports'],
    targetName: 'agent-strategy-reports',
  },
  {
    indexes: [
      {
        key: { organization: 1, requestId: 1, thread: 1 },
        name: 'idx_agent_input_request_unique',
        unique: true,
      },
    ],
    legacyNames: ['agent_input_requests', 'requests'],
    targetName: 'agent-input-requests',
  },
  {
    indexes: [
      {
        key: { createdAt: -1, organization: 1, user: 1 },
        name: 'createdAt_-1_organization_1_user_1',
      },
    ],
    legacyNames: ['agent_memories', 'memories'],
    targetName: 'agent-memories',
  },
  {
    indexes: [
      {
        key: { organization: 1, thread: 1 },
        name: 'idx_agent_profile_snapshot_thread',
        unique: true,
      },
    ],
    legacyNames: ['agent_profile_snapshots', 'profile_snapshots'],
    targetName: 'agent-profile-snapshots',
  },
  {
    indexes: [
      {
        key: { createdAt: -1, organization: 1, status: 1 },
        name: 'createdAt_-1_organization_1_status_1',
        partialFilterExpression: { isDeleted: false },
      },
      {
        key: { createdAt: -1, organization: 1, strategy: 1 },
        name: 'createdAt_-1_organization_1_strategy_1',
        partialFilterExpression: { isDeleted: false },
      },
      {
        key: { parentRun: 1 },
        name: 'parentRun_1',
      },
    ],
    legacyNames: ['agent_runs', 'runs'],
    targetName: 'agent-runs',
  },
  {
    indexes: [
      {
        key: { organization: 1, thread: 1 },
        name: 'idx_agent_session_binding_thread',
        unique: true,
      },
    ],
    legacyNames: ['agent_session_bindings', 'session_bindings'],
    targetName: 'agent-session-bindings',
  },
  {
    indexes: [
      {
        key: { commandId: 1, organization: 1, thread: 1 },
        name: 'idx_agent_thread_events_command',
      },
      {
        key: { organization: 1, runId: 1, sequence: 1 },
        name: 'idx_agent_thread_events_run',
        partialFilterExpression: { runId: { $exists: true } },
      },
      {
        key: { organization: 1, sequence: 1, thread: 1 },
        name: 'idx_agent_thread_events_sequence',
        unique: true,
      },
    ],
    legacyNames: ['agent_thread_events', 'thread_events'],
    targetName: 'agent-thread-events',
  },
  {
    indexes: [
      {
        key: { organization: 1, thread: 1 },
        name: 'idx_agent_thread_snapshot_thread',
        unique: true,
      },
    ],
    legacyNames: ['agent_thread_snapshots', 'thread_snapshots'],
    mergeStrategy: 'organizationThread',
    targetName: 'agent-thread-snapshots',
  },
  {
    indexes: [
      {
        key: { isDeleted: 1, organization: 1 },
        name: 'isDeleted_1_organization_1',
        partialFilterExpression: { isDeleted: false },
      },
      {
        key: { isDeleted: 1, organization: 1, status: 1 },
        name: 'isDeleted_1_organization_1_status_1',
        partialFilterExpression: { isDeleted: false },
      },
    ],
    legacyNames: ['agent_campaigns', 'campaigns'],
    targetName: 'agent-campaigns',
  },
  {
    indexes: [
      {
        key: { createdAt: -1, isDeleted: 1, organization: 1, room: 1 },
        name: 'idx_room_messages_by_org',
        partialFilterExpression: { isDeleted: false },
      },
      {
        key: { createdAt: -1, isDeleted: 1, room: 1 },
        name: 'idx_recent_messages',
        partialFilterExpression: { isDeleted: false },
      },
    ],
    legacyNames: ['messages', 'agent_messages'],
    targetName: 'agent-messages',
  },
  {
    indexes: [
      {
        key: { isDeleted: 1, organization: 1, updatedAt: -1, user: 1 },
        name: 'idx_user_threads',
        partialFilterExpression: { isDeleted: false },
      },
    ],
    legacyNames: ['rooms', 'agent_threads'],
    targetName: 'agent-threads',
  },
  {
    indexes: [],
    legacyNames: ['goals', 'agent_goals'],
    targetName: 'agent-goals',
  },
];

function canonicalizeIndexDefinition(
  definition: CanonicalIndexDefinition,
): Document {
  return {
    key: definition.key,
    name: definition.name,
    partialFilterExpression: definition.partialFilterExpression ?? null,
    unique: definition.unique ?? false,
  };
}

function canonicalizeExistingIndex(index: IndexDescription): Document {
  return {
    key: index.key,
    name: index.name,
    partialFilterExpression: index.partialFilterExpression ?? null,
    unique: index.unique ?? false,
  };
}

function collectionNamesFor(plan: CollectionPlan): string[] {
  return [plan.targetName, ...plan.legacyNames];
}

function formatIndex(definition: CanonicalIndexDefinition): string {
  const parts = Object.entries(definition.key).map(
    ([field, direction]) => `${field}:${direction}`,
  );
  return `${definition.name} [${parts.join(', ')}]`;
}

async function collectionExists(db: Db, name: string): Promise<boolean> {
  const collections = await db.listCollections({ name }).toArray();
  return collections.length > 0;
}

async function countDocuments(db: Db, name: string): Promise<number> {
  return await db.collection(name).countDocuments();
}

async function dropCollection(
  db: Db,
  name: string,
  dryRun: boolean,
  summary: MigrationSummary,
): Promise<void> {
  if (!(await collectionExists(db, name))) {
    return;
  }

  if (dryRun) {
    logger.log(`[DRY RUN] Would drop empty collection "${name}"`);
    return;
  }

  await db.collection(name).drop();
  summary.collectionsDropped.push(name);
  logger.log(`Dropped empty collection "${name}"`);
}

async function renameCollection(
  db: Db,
  from: string,
  to: string,
  dryRun: boolean,
  summary: MigrationSummary,
): Promise<void> {
  if (dryRun) {
    logger.log(`[DRY RUN] Would rename collection "${from}" -> "${to}"`);
    return;
  }

  await db.collection(from).rename(to);
  summary.collectionsRenamed.push({ from, to });
  logger.log(`Renamed collection "${from}" -> "${to}"`);
}

async function mergeByOrganizationThread(
  db: Db,
  from: string,
  to: string,
  dryRun: boolean,
): Promise<void> {
  const source = db.collection(from);
  const target = db.collection(to);
  const sourceDocs = await source.find({}).toArray();

  for (const sourceDoc of sourceDocs) {
    const selector = {
      organization: sourceDoc.organization,
      thread: sourceDoc.thread,
    };
    const targetDoc = await target.findOne(selector);

    if (dryRun) {
      logger.log(
        `[DRY RUN] Would ${targetDoc ? 'replace' : 'insert'} "${from}" snapshot for thread ${String(sourceDoc.thread)}`,
      );
      continue;
    }

    if (targetDoc) {
      const replacement = {
        ...sourceDoc,
        _id: targetDoc._id,
      };
      await target.replaceOne({ _id: targetDoc._id }, replacement);
      continue;
    }

    await target.insertOne(sourceDoc);
  }
}

async function resolveTargetCollection(
  db: Db,
  plan: CollectionPlan,
  dryRun: boolean,
  summary: MigrationSummary,
): Promise<string | null> {
  const existingNames = [];
  for (const name of collectionNamesFor(plan)) {
    if (await collectionExists(db, name)) {
      existingNames.push(name);
    }
  }

  if (existingNames.length === 0) {
    summary.collectionsSkipped.push(plan.targetName);
    logger.log(`Skipping "${plan.targetName}" - collection does not exist`);
    return null;
  }

  const counts = new Map<string, number>();
  for (const name of existingNames) {
    counts.set(name, await countDocuments(db, name));
  }

  const targetExists = counts.has(plan.targetName);
  const legacyNames = existingNames.filter((name) => name !== plan.targetName);

  if (targetExists) {
    const targetCount = counts.get(plan.targetName) ?? 0;

    for (const legacyName of legacyNames) {
      const legacyCount = counts.get(legacyName) ?? 0;

      if (legacyCount === 0) {
        await dropCollection(db, legacyName, dryRun, summary);
        continue;
      }

      if (targetCount === 0) {
        await dropCollection(db, plan.targetName, dryRun, summary);
        await renameCollection(
          db,
          legacyName,
          plan.targetName,
          dryRun,
          summary,
        );
        return dryRun ? legacyName : plan.targetName;
      }

      if (plan.mergeStrategy === 'organizationThread') {
        logger.log(
          `${plan.targetName} has overlapping data; merging "${legacyName}" into "${plan.targetName}" by (organization, thread)`,
        );
        await mergeByOrganizationThread(
          db,
          legacyName,
          plan.targetName,
          dryRun,
        );
        await dropCollection(db, legacyName, dryRun, summary);
        return plan.targetName;
      }

      throw new Error(
        `Manual merge required for "${plan.targetName}": both "${plan.targetName}" (${targetCount}) and "${legacyName}" (${legacyCount}) contain documents.`,
      );
    }

    return plan.targetName;
  }

  const populatedLegacyNames = legacyNames.filter(
    (name) => (counts.get(name) ?? 0) > 0,
  );

  if (populatedLegacyNames.length > 1) {
    throw new Error(
      `Manual merge required for "${plan.targetName}": multiple legacy collections contain documents (${populatedLegacyNames.join(', ')}).`,
    );
  }

  if (legacyNames.length === 0) {
    return plan.targetName;
  }

  const primaryLegacyName = populatedLegacyNames[0] ?? legacyNames[0];
  for (const legacyName of legacyNames) {
    if (legacyName === primaryLegacyName) {
      continue;
    }

    if ((counts.get(legacyName) ?? 0) > 0) {
      throw new Error(
        `Manual merge required for "${plan.targetName}": unexpected populated duplicate "${legacyName}".`,
      );
    }

    await dropCollection(db, legacyName, dryRun, summary);
  }

  await renameCollection(
    db,
    primaryLegacyName,
    plan.targetName,
    dryRun,
    summary,
  );

  return dryRun ? primaryLegacyName : plan.targetName;
}

async function reconcileIndexes(
  collection: Collection,
  plan: CollectionPlan,
  dryRun: boolean,
  summary: MigrationSummary,
): Promise<void> {
  const expectedByName = new Map(
    plan.indexes.map((index) => [
      index.name,
      canonicalizeIndexDefinition(index),
    ]),
  );
  const existingIndexes = await collection.indexes();

  for (const existingIndex of existingIndexes) {
    if (existingIndex.name === '_id_') {
      continue;
    }

    const expectedIndex = expectedByName.get(existingIndex.name);
    if (!expectedIndex) {
      if (dryRun) {
        logger.log(
          `[DRY RUN] Would drop extra index "${collection.collectionName}.${existingIndex.name}"`,
        );
      } else {
        await collection.dropIndex(existingIndex.name);
        summary.indexesDropped.push({
          collection: collection.collectionName,
          name: existingIndex.name,
        });
        logger.log(
          `Dropped extra index "${collection.collectionName}.${existingIndex.name}"`,
        );
      }
      continue;
    }

    const actualIndex = canonicalizeExistingIndex(existingIndex);
    if (deepEqual(actualIndex, expectedIndex)) {
      continue;
    }

    if (dryRun) {
      logger.log(
        `[DRY RUN] Would replace mismatched index "${collection.collectionName}.${existingIndex.name}"`,
      );
    } else {
      await collection.dropIndex(existingIndex.name);
      summary.indexesDropped.push({
        collection: collection.collectionName,
        name: existingIndex.name,
      });
      logger.log(
        `Dropped mismatched index "${collection.collectionName}.${existingIndex.name}"`,
      );
    }
  }

  const refreshedIndexes = await collection.indexes();
  const refreshedNames = new Set(refreshedIndexes.map((index) => index.name));

  for (const index of plan.indexes) {
    if (refreshedNames.has(index.name)) {
      continue;
    }

    if (dryRun) {
      logger.log(
        `[DRY RUN] Would create index "${collection.collectionName}.${formatIndex(index)}"`,
      );
      continue;
    }

    await collection.createIndex(index.key, {
      name: index.name,
      ...(index.partialFilterExpression
        ? { partialFilterExpression: index.partialFilterExpression }
        : {}),
      ...(index.unique ? { unique: true } : {}),
    });
    summary.indexesCreated.push({
      collection: collection.collectionName,
      name: index.name,
    });
    logger.log(
      `Created index "${collection.collectionName}.${formatIndex(index)}"`,
    );
  }
}

async function fixAgentCollections(
  db: Db,
  dryRun: boolean,
): Promise<MigrationSummary> {
  const summary: MigrationSummary = {
    collectionsDropped: [],
    collectionsRenamed: [],
    collectionsSkipped: [],
    indexesCreated: [],
    indexesDropped: [],
  };

  for (const plan of COLLECTION_PLANS) {
    logger.log(`\nProcessing "${plan.targetName}"...`);
    const resolvedCollectionName = await resolveTargetCollection(
      db,
      plan,
      dryRun,
      summary,
    );

    if (!resolvedCollectionName) {
      continue;
    }

    await reconcileIndexes(
      db.collection(resolvedCollectionName),
      plan,
      dryRun,
      summary,
    );
  }

  return summary;
}

async function main(): Promise<void> {
  const args = parseArgs();

  await runScript(
    'Fix Agent Collections',
    async (db) => {
      const summary = await fixAgentCollections(db, args.dryRun);

      logger.log('\n' + '═'.repeat(60));
      logger.log('Migration summary');
      logger.log('═'.repeat(60));
      logger.log(
        `Collections renamed: ${summary.collectionsRenamed.length || 0}`,
      );
      logger.log(
        `Collections dropped: ${summary.collectionsDropped.length || 0}`,
      );
      logger.log(`Indexes created: ${summary.indexesCreated.length || 0}`);
      logger.log(`Indexes dropped: ${summary.indexesDropped.length || 0}`);
      logger.log(
        `Collections skipped: ${summary.collectionsSkipped.length || 0}`,
      );

      if (args.dryRun) {
        logger.log('\nDRY RUN ONLY - no changes applied');
      }
    },
    {
      database: args.database || 'agent',
      uri: args.uri,
    },
  );
}

void main();
