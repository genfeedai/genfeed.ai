/**
 * Repair or retire posts with broken credential references.
 *
 * Dry-run by default. Pass `--live` to apply changes.
 *
 * Recovery policy:
 * - Reassign posts only when there is exactly one active credential candidate
 *   with the same user, organization, brand, and platform.
 * - Otherwise soft-delete the posts as unrecoverable legacy residue.
 *
 * Usage:
 *   bun run apps/server/api/scripts/mongodb/repair-post-credentials.ts
 *   bun run apps/server/api/scripts/mongodb/repair-post-credentials.ts --env=production
 *   bun run apps/server/api/scripts/mongodb/repair-post-credentials.ts --live
 *   bun run apps/server/api/scripts/mongodb/repair-post-credentials.ts --env=production --live
 */

import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { getClient, runScript } from '@api-scripts/db/connection';
import { parseArgs } from '@api-scripts/db/seed-utils';
import type { ObjectId } from 'mongodb';

const logger = {
  error: (...args: unknown[]) => console.error(...args),
  log: (...args: unknown[]) => console.log(...args),
};

interface BrokenPostDocument {
  _id: ObjectId;
  brand: ObjectId;
  credential: ObjectId;
  organization: ObjectId;
  platform: string;
  user: ObjectId;
}

interface CredentialCandidate {
  _id: ObjectId;
  createdAt?: Date;
  externalHandle?: string;
  externalId?: string;
  externalName?: string;
  isDeleted?: boolean;
  updatedAt?: Date;
}

interface BrokenPostGroupSummary {
  action: 'reassign' | 'soft-delete';
  activeCandidateCount: number;
  brandLabel: string | null;
  deletedCandidateCount: number;
  missingCredentialId: string;
  orgLabel: string | null;
  platform: string;
  postCount: number;
  reason: string;
  replacementCredentialId?: string;
  userLabel: string | null;
}

const args = parseArgs();

runScript(
  'Repair Post Credentials',
  async () => {
    const client = getClient();
    const cloud = client.db(DB_CONNECTIONS.CLOUD);
    const auth = client.db(DB_CONNECTIONS.AUTH);

    const posts = cloud.collection<BrokenPostDocument>('posts');
    const credentials = cloud.collection<CredentialCandidate>('credentials');
    const brands = cloud.collection<{ _id: ObjectId; label?: string }>(
      'brands',
    );
    const organizations = auth.collection<{
      _id: ObjectId;
      label?: string;
      name?: string;
    }>('organizations');
    const users = auth.collection<{
      _id: ObjectId;
      email?: string;
      firstName?: string;
      lastName?: string;
      username?: string;
    }>('users');

    const brokenPosts = await posts
      .aggregate<BrokenPostDocument>([
        {
          $match: {
            credential: { $exists: true, $ne: null },
            isDeleted: { $ne: true },
          },
        },
        {
          $lookup: {
            as: 'credentialDoc',
            foreignField: '_id',
            from: 'credentials',
            localField: 'credential',
          },
        },
        {
          $match: {
            credentialDoc: { $size: 0 },
          },
        },
        {
          $project: {
            _id: 1,
            brand: 1,
            credential: 1,
            organization: 1,
            platform: 1,
            user: 1,
          },
        },
      ])
      .toArray();

    if (brokenPosts.length === 0) {
      logger.log('✅ No broken post credential references found.');
      return {
        deleted: 0,
        dryRun: args.dryRun,
        groups: 0,
        reassigned: 0,
      };
    }

    const groups = new Map<string, BrokenPostDocument[]>();
    for (const post of brokenPosts) {
      const key = String(post.credential);
      const existing = groups.get(key);
      if (existing) {
        existing.push(post);
      } else {
        groups.set(key, [post]);
      }
    }

    const summaries: BrokenPostGroupSummary[] = [];
    let reassignedPostCount = 0;
    let deletedPostCount = 0;

    for (const [missingCredentialId, groupPosts] of groups.entries()) {
      const sample = groupPosts[0];
      const candidateDocs = await credentials
        .find({
          brand: sample.brand,
          organization: sample.organization,
          platform: sample.platform,
          user: sample.user,
        })
        .project({
          _id: 1,
          createdAt: 1,
          externalHandle: 1,
          externalId: 1,
          externalName: 1,
          isDeleted: 1,
          updatedAt: 1,
        })
        .toArray();

      const activeCandidates = candidateDocs.filter(
        (candidate) => candidate.isDeleted !== true,
      );
      const deletedCandidates = candidateDocs.filter(
        (candidate) => candidate.isDeleted === true,
      );

      const [brandDoc, organizationDoc, userDoc] = await Promise.all([
        brands.findOne({ _id: sample.brand }, { projection: { label: 1 } }),
        organizations.findOne(
          { _id: sample.organization },
          { projection: { label: 1, name: 1 } },
        ),
        users.findOne(
          { _id: sample.user },
          {
            projection: {
              email: 1,
              firstName: 1,
              lastName: 1,
              username: 1,
            },
          },
        ),
      ]);

      const userLabel =
        userDoc?.email ??
        userDoc?.username ??
        [userDoc?.firstName, userDoc?.lastName].filter(Boolean).join(' ') ??
        null;

      const summary: BrokenPostGroupSummary = {
        action: 'soft-delete',
        activeCandidateCount: activeCandidates.length,
        brandLabel: brandDoc?.label ?? null,
        deletedCandidateCount: deletedCandidates.length,
        missingCredentialId,
        orgLabel: organizationDoc?.name ?? organizationDoc?.label ?? null,
        platform: sample.platform,
        postCount: groupPosts.length,
        reason: '',
        userLabel,
      };

      if (activeCandidates.length === 1) {
        summary.action = 'reassign';
        summary.reason =
          'found exactly one active credential candidate with the same user, organization, brand, and platform';
        summary.replacementCredentialId = String(activeCandidates[0]._id);

        if (args.dryRun) {
          logger.log(
            `[DRY RUN] Would reassign ${groupPosts.length} ${sample.platform} post(s) from missing credential ${missingCredentialId} -> ${summary.replacementCredentialId}`,
          );
        } else {
          const result = await posts.updateMany(
            {
              _id: { $in: groupPosts.map((post) => post._id) },
              isDeleted: { $ne: true },
            },
            {
              $set: {
                credential: activeCandidates[0]._id,
                updatedAt: new Date(),
              },
            },
          );
          logger.log(
            `🔄 Reassigned ${result.modifiedCount} ${sample.platform} post(s) from missing credential ${missingCredentialId} -> ${summary.replacementCredentialId}`,
          );
        }

        reassignedPostCount += groupPosts.length;
      } else {
        summary.reason =
          activeCandidates.length === 0
            ? deletedCandidates.length > 0
              ? 'no active replacement credential exists; only soft-deleted candidates remain'
              : 'no replacement credential exists for the same user, organization, brand, and platform'
            : 'multiple active replacement credentials exist; automatic recovery would be ambiguous';

        if (args.dryRun) {
          logger.log(
            `[DRY RUN] Would soft-delete ${groupPosts.length} unrecoverable ${sample.platform} post(s) tied to missing credential ${missingCredentialId}`,
          );
        } else {
          const result = await posts.updateMany(
            {
              _id: { $in: groupPosts.map((post) => post._id) },
              isDeleted: { $ne: true },
            },
            {
              $set: {
                isDeleted: true,
                updatedAt: new Date(),
              },
            },
          );
          logger.log(
            `🗑️  Soft-deleted ${result.modifiedCount} unrecoverable ${sample.platform} post(s) tied to missing credential ${missingCredentialId}`,
          );
        }

        deletedPostCount += groupPosts.length;
      }

      summaries.push(summary);
    }

    logger.log('');
    logger.log('═'.repeat(80));
    logger.log(`POST CREDENTIAL ${args.dryRun ? 'DRY-RUN ' : ''}SUMMARY`);
    logger.log('═'.repeat(80));

    for (const summary of summaries) {
      logger.log(
        `- ${summary.platform} | org=${summary.orgLabel ?? 'unknown'} | brand=${summary.brandLabel ?? 'unknown'} | user=${summary.userLabel ?? 'unknown'} | posts=${summary.postCount} | action=${summary.action}`,
      );
      logger.log(`  missing credential: ${summary.missingCredentialId}`);
      logger.log(`  reason: ${summary.reason}`);
      logger.log(
        `  candidates: ${summary.activeCandidateCount} active / ${summary.deletedCandidateCount} soft-deleted`,
      );
      if (summary.replacementCredentialId) {
        logger.log(`  replacement: ${summary.replacementCredentialId}`);
      }
    }

    logger.log('');
    logger.log(
      `${args.dryRun ? '[DRY RUN] Would reassign' : 'Reassigned'}: ${reassignedPostCount}`,
    );
    logger.log(
      `${args.dryRun ? '[DRY RUN] Would soft-delete' : 'Soft-deleted'}: ${deletedPostCount}`,
    );
    logger.log(`Broken groups: ${summaries.length}`);

    return {
      deleted: deletedPostCount,
      dryRun: args.dryRun,
      groups: summaries.length,
      reassigned: reassignedPostCount,
      summaries,
    };
  },
  {
    database: DB_CONNECTIONS.CLOUD,
    uri: args.uri,
  },
).catch((error) => {
  logger.error('Post credential repair failed', error);
  process.exit(1);
});
