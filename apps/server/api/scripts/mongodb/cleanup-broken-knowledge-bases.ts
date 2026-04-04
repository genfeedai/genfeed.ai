/**
 * Soft-delete orphaned default knowledge bases with broken ownership refs.
 *
 * Dry-run by default. Pass `--live` to apply changes.
 *
 * Cleanup policy is intentionally narrow:
 * - label must be `Default Knowledge Base`
 * - status must be `draft`
 * - scope must be `brand`
 * - sources must be empty
 * - at least one of user / organization / brand must point to a missing doc
 *
 * Usage:
 *   bun run apps/server/api/scripts/mongodb/cleanup-broken-knowledge-bases.ts
 *   bun run apps/server/api/scripts/mongodb/cleanup-broken-knowledge-bases.ts --env=production
 *   bun run apps/server/api/scripts/mongodb/cleanup-broken-knowledge-bases.ts --live
 *   bun run apps/server/api/scripts/mongodb/cleanup-broken-knowledge-bases.ts --env=production --live
 */

import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { getClient, runScript } from '@api-scripts/db/connection';
import { parseArgs } from '@api-scripts/db/seed-utils';
import type { ObjectId } from 'mongodb';

const logger = {
  error: (...args: unknown[]) => console.error(...args),
  log: (...args: unknown[]) => console.log(...args),
};

interface KnowledgeBaseDocument {
  _id: ObjectId;
  brand?: ObjectId;
  isDeleted?: boolean;
  label?: string;
  organization?: ObjectId;
  scope?: string;
  sources?: unknown[];
  status?: string;
  user?: ObjectId;
}

const args = parseArgs();

runScript(
  'Cleanup Broken Knowledge Bases',
  async () => {
    const client = getClient();
    const cloud = client.db(DB_CONNECTIONS.CLOUD);
    const auth = client.db(DB_CONNECTIONS.AUTH);

    const knowledgeBases =
      cloud.collection<KnowledgeBaseDocument>('knowledge-bases');
    const brands = cloud.collection<{ _id: ObjectId }>('brands');
    const organizations = auth.collection<{ _id: ObjectId }>('organizations');
    const users = auth.collection<{ _id: ObjectId }>('users');

    const docs = await knowledgeBases
      .find({ isDeleted: { $ne: true } })
      .project({
        _id: 1,
        brand: 1,
        label: 1,
        organization: 1,
        scope: 1,
        sources: 1,
        status: 1,
        user: 1,
      })
      .toArray();

    const candidates: Array<
      KnowledgeBaseDocument & {
        brandMissing: boolean;
        orgMissing: boolean;
        userMissing: boolean;
      }
    > = [];

    for (const doc of docs) {
      const [userExists, organizationExists, brandExists] = await Promise.all([
        doc.user ? users.countDocuments({ _id: doc.user }) : 0,
        doc.organization
          ? organizations.countDocuments({ _id: doc.organization })
          : 0,
        doc.brand ? brands.countDocuments({ _id: doc.brand }) : 0,
      ]);

      const userMissing = Boolean(doc.user) && userExists === 0;
      const orgMissing = Boolean(doc.organization) && organizationExists === 0;
      const brandMissing = Boolean(doc.brand) && brandExists === 0;
      const isDefaultDraftBrandKb =
        doc.label === 'Default Knowledge Base' &&
        doc.scope?.toLowerCase() === 'brand' &&
        doc.status?.toLowerCase() === 'draft' &&
        (doc.sources?.length ?? 0) === 0;

      if (
        isDefaultDraftBrandKb &&
        (userMissing || orgMissing || brandMissing)
      ) {
        candidates.push({
          ...doc,
          brandMissing,
          orgMissing,
          userMissing,
        });
      }
    }

    if (candidates.length === 0) {
      logger.log(
        '✅ No broken default knowledge bases matched the cleanup policy.',
      );
      return { deleted: 0, dryRun: args.dryRun };
    }

    for (const candidate of candidates) {
      const brokenRefs = [
        candidate.userMissing ? 'user' : null,
        candidate.orgMissing ? 'organization' : null,
        candidate.brandMissing ? 'brand' : null,
      ].filter(Boolean);

      if (args.dryRun) {
        logger.log(
          `[DRY RUN] Would soft-delete knowledge base ${String(candidate._id)} (${candidate.label ?? 'unknown'}) with broken refs: ${brokenRefs.join(', ')}`,
        );
      } else {
        await knowledgeBases.updateOne(
          { _id: candidate._id, isDeleted: { $ne: true } },
          {
            $set: {
              isDeleted: true,
              updatedAt: new Date(),
            },
          },
        );
        logger.log(
          `🗑️  Soft-deleted knowledge base ${String(candidate._id)} with broken refs: ${brokenRefs.join(', ')}`,
        );
      }
    }

    logger.log('');
    logger.log('═'.repeat(80));
    logger.log(`KNOWLEDGE BASE ${args.dryRun ? 'DRY-RUN ' : ''}SUMMARY`);
    logger.log('═'.repeat(80));
    logger.log(
      `${args.dryRun ? '[DRY RUN] Would soft-delete' : 'Soft-deleted'}: ${candidates.length}`,
    );
    logger.log(
      `Candidate IDs: ${candidates.map((candidate) => String(candidate._id)).join(', ')}`,
    );

    return {
      deleted: candidates.length,
      dryRun: args.dryRun,
      ids: candidates.map((candidate) => String(candidate._id)),
    };
  },
  {
    database: DB_CONNECTIONS.CLOUD,
    uri: args.uri,
  },
).catch((error) => {
  logger.error('Knowledge base cleanup failed', error);
  process.exit(1);
});
