/**
 * Remove a localhost-style orphan cluster tied to a missing auth.users document.
 *
 * Dry-run by default. Pass `--live` to apply changes.
 *
 * The script targets documents that directly reference the missing user id:
 * - auth.settings
 * - auth.organizations
 * - auth.members
 * - cloud.brands
 *
 * It aborts if the user still exists.
 *
 * Usage:
 *   bun run apps/server/api/scripts/mongodb/cleanup-orphaned-user-cluster.ts --userId=<missing-user-id>
 *   bun run apps/server/api/scripts/mongodb/cleanup-orphaned-user-cluster.ts --userId=<missing-user-id> --live
 */

import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { getClient, runScript } from '@api-scripts/db/connection';
import { parseArgs } from '@api-scripts/db/seed-utils';
import { type Document, ObjectId } from 'mongodb';

const logger = {
  error: (...args: unknown[]) => console.error(...args),
  log: (...args: unknown[]) => console.log(...args),
};

interface ClusterArgs {
  dryRun: boolean;
  uri?: string;
  userId: string;
}

function parseClusterArgs(): ClusterArgs {
  const baseArgs = parseArgs();
  const userId = process.argv
    .slice(2)
    .find((arg) => arg.startsWith('--userId='))
    ?.split('=')[1];

  if (!userId) {
    throw new Error('Missing required --userId=<missing-user-id> argument.');
  }

  if (!ObjectId.isValid(userId)) {
    throw new Error(`Invalid --userId value: ${userId}`);
  }

  return {
    ...baseArgs,
    userId,
  };
}

const args = parseClusterArgs();

runScript(
  'Cleanup Orphaned User Cluster',
  async () => {
    const userObjectId = new ObjectId(args.userId);
    const client = getClient();
    const auth = client.db(DB_CONNECTIONS.AUTH);
    const cloud = client.db(DB_CONNECTIONS.CLOUD);

    const users = auth.collection<{ _id: ObjectId }>('users');
    const userExists = await users.countDocuments({ _id: userObjectId });

    if (userExists > 0) {
      throw new Error(
        `User ${args.userId} still exists. Refusing to delete linked documents.`,
      );
    }

    const targets: Array<{
      collection: string;
      db: typeof auth | typeof cloud;
      label: string;
    }> = [
      {
        collection: 'settings',
        db: auth,
        label: 'auth.settings',
      },
      {
        collection: 'organizations',
        db: auth,
        label: 'auth.organizations',
      },
      {
        collection: 'members',
        db: auth,
        label: 'auth.members',
      },
      {
        collection: 'brands',
        db: cloud,
        label: 'cloud.brands',
      },
    ];

    let totalDeleted = 0;

    for (const target of targets) {
      const collection = target.db.collection<Document>(target.collection);
      const docs = await collection
        .find({ isDeleted: { $ne: true }, user: userObjectId })
        .project({ _id: 1 })
        .toArray();

      if (docs.length === 0) {
        logger.log(`No matching docs in ${target.label}`);
        continue;
      }

      if (args.dryRun) {
        logger.log(
          `[DRY RUN] Would delete ${docs.length} doc(s) from ${target.label}: ${docs.map((doc) => String(doc._id)).join(', ')}`,
        );
      } else {
        const result = await collection.deleteMany({
          _id: { $in: docs.map((doc) => doc._id) },
        });
        logger.log(
          `🗑️  Deleted ${result.deletedCount} doc(s) from ${target.label}: ${docs.map((doc) => String(doc._id)).join(', ')}`,
        );
      }

      totalDeleted += docs.length;
    }

    logger.log('');
    logger.log('═'.repeat(80));
    logger.log(`ORPHAN USER CLUSTER ${args.dryRun ? 'DRY-RUN ' : ''}SUMMARY`);
    logger.log('═'.repeat(80));
    logger.log(`User: ${args.userId}`);
    logger.log(
      `${args.dryRun ? '[DRY RUN] Would delete' : 'Deleted'} total docs: ${totalDeleted}`,
    );

    return {
      deleted: totalDeleted,
      dryRun: args.dryRun,
      userId: args.userId,
    };
  },
  {
    database: DB_CONNECTIONS.AUTH,
    uri: args.uri,
  },
).catch((error) => {
  logger.error('orphaned user cluster cleanup failed', error);
  process.exit(1);
});
