#!/usr/bin/env bun
/**
 * discard-orphan-media.ts
 *
 * Dry-run-default discard of the #581 orphan prod media dataset:
 * rows whose stored media fields are empty. Does not HTTP-hit CDN.
 *
 * Writer audit (2026-08-17): Ingredient.cdnUrl / s3Key / sampleAudioUrl and
 * Asset.cloudObjectKey still have live writers — this script does not drop
 * those columns. Cancelled migration scripts are already gone.
 *
 * Default is dry-run. `--apply` mutates Postgres. `--delete-s3` is required
 * before any S3 listing/delete, and S3 deletes still need `--apply`.
 *
 * Usage:
 *   bun scripts/migrations/discard-orphan-media.ts
 *   bun scripts/migrations/discard-orphan-media.ts --env=production
 *   bun scripts/migrations/discard-orphan-media.ts --env=production --apply
 *   bun scripts/migrations/discard-orphan-media.ts --env=production --delete-s3
 *   bun scripts/migrations/discard-orphan-media.ts --env=production --apply --delete-s3
 *
 * Optional:
 *   --organization-id=<id>   tenant-scope reads/writes
 *   --created-before=<ISO>   override the 2026-07-27 snapshot cutoff
 *   --unbounded              classify every empty-key row (unsafe for apply)
 *
 * Production mutation is operator-run later. This session does not apply.
 */

import { resolve } from 'node:path';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../../packages/prisma/src/index';
import { normalizePgUrl } from './_pg-ssl';
import {
  classifyDiscardAction,
  classifyS3Key,
  collectSurvivingObjectKeys,
  type DiscardAction,
  type DiscardCounts,
  emptyDiscardCounts,
  formatSummaryTable,
  hasAssetDownstreamReference,
  incrementDiscardCount,
  isOrphanAsset,
  isOrphanIngredient,
  parseDiscardOrphanMediaArgs,
  toSummaryRow,
} from './discard-orphan-media.classifier';

const args = parseDiscardOrphanMediaArgs(process.argv.slice(2));

config({
  path: resolve(__dirname, `../../apps/server/api/.env.${args.envSuffix}`),
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    `DATABASE_URL is required (loaded from .env.${args.envSuffix})`,
  );
}

interface IngredientRow {
  cdnUrl: string | null;
  createdAt: Date;
  id: string;
  organizationId: string | null;
  s3Key: string | null;
  sampleAudioUrl: string | null;
}

interface AssetRow {
  cloudObjectKey: string | null;
  createdAt: Date;
  id: string;
  parentArticleId: string | null;
  parentBrandId: string | null;
  parentIngredientId: string | null;
  parentOrgId: string | null;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: normalizePgUrl(databaseUrl),
  });
  return new PrismaClient({ adapter });
}

function createS3Client(): { bucket: string; client: S3Client } {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('AWS_S3_BUCKET is required for --delete-s3');
  }
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  return {
    bucket,
    client: new S3Client({
      region: process.env.AWS_REGION || 'us-west-1',
      ...(accessKeyId && secretAccessKey
        ? {
            credentials: {
              accessKeyId,
              secretAccessKey,
            },
          }
        : {}),
    }),
  };
}

function addReferencedIds(
  target: Set<string>,
  values: ReadonlyArray<string | null | undefined>,
): void {
  for (const value of values) {
    if (value) {
      target.add(value);
    }
  }
}

async function collectReferencedIngredientIds(
  prisma: PrismaClient,
  ids: ReadonlyArray<string>,
): Promise<Set<string>> {
  const referenced = new Set<string>();
  if (ids.length === 0) {
    return referenced;
  }

  const idFilter = { in: [...ids] };

  const [
    children,
    posts,
    brandVoices,
    brandMusics,
    personaAvatars,
    personaVoices,
    captions,
    prompts,
    editorProjects,
    clipResults,
    assets,
    trackedLinks,
    relatedIngredients,
  ] = await Promise.all([
    prisma.ingredient.findMany({
      select: { parentId: true },
      where: { parentId: idFilter },
    }),
    prisma.post.findMany({
      select: { entityIngredientId: true },
      where: { entityIngredientId: idFilter },
    }),
    prisma.brand.findMany({
      select: { voiceIngredientId: true },
      where: { voiceIngredientId: idFilter },
    }),
    prisma.brand.findMany({
      select: { musicIngredientId: true },
      where: { musicIngredientId: idFilter },
    }),
    prisma.persona.findMany({
      select: { avatarIngredientId: true },
      where: { avatarIngredientId: idFilter },
    }),
    prisma.persona.findMany({
      select: { voiceIngredientId: true },
      where: { voiceIngredientId: idFilter },
    }),
    prisma.caption.findMany({
      select: { ingredientId: true },
      where: { ingredientId: idFilter },
    }),
    prisma.prompt.findMany({
      select: { ingredientId: true },
      where: { ingredientId: idFilter },
    }),
    prisma.editorProject.findMany({
      select: { renderedVideoId: true },
      where: { renderedVideoId: idFilter },
    }),
    prisma.clipResult.findMany({
      select: { ingredientId: true },
      where: { ingredientId: idFilter },
    }),
    prisma.asset.findMany({
      select: { parentIngredientId: true },
      where: { parentIngredientId: idFilter },
    }),
    prisma.trackedLink.findMany({
      select: { contentId: true },
      where: { contentId: idFilter },
    }),
    prisma.ingredient.findMany({
      select: { id: true },
      where: {
        id: idFilter,
        OR: [
          { bookmarkExtracted: { some: {} } },
          { bookmarkGenerated: { some: {} } },
          { postAnalyticsIngredients: { some: {} } },
          { postIngredients: { some: {} } },
          { sourceOf: { some: {} } },
          { sources: { some: {} } },
          { tags: { some: {} } },
          { taskApprovedOutputs: { some: {} } },
          { taskLinkedOutputs: { some: {} } },
          { trainingSources: { some: {} } },
        ],
      },
    }),
  ]);

  addReferencedIds(
    referenced,
    children.map((row) => row.parentId),
  );
  addReferencedIds(
    referenced,
    posts.map((row) => row.entityIngredientId),
  );
  addReferencedIds(
    referenced,
    brandVoices.map((row) => row.voiceIngredientId),
  );
  addReferencedIds(
    referenced,
    brandMusics.map((row) => row.musicIngredientId),
  );
  addReferencedIds(
    referenced,
    personaAvatars.map((row) => row.avatarIngredientId),
  );
  addReferencedIds(
    referenced,
    personaVoices.map((row) => row.voiceIngredientId),
  );
  addReferencedIds(
    referenced,
    captions.map((row) => row.ingredientId),
  );
  addReferencedIds(
    referenced,
    prompts.map((row) => row.ingredientId),
  );
  addReferencedIds(
    referenced,
    editorProjects.map((row) => row.renderedVideoId),
  );
  addReferencedIds(
    referenced,
    clipResults.map((row) => row.ingredientId),
  );
  addReferencedIds(
    referenced,
    assets.map((row) => row.parentIngredientId),
  );
  addReferencedIds(
    referenced,
    trackedLinks.map((row) => row.contentId),
  );
  addReferencedIds(
    referenced,
    relatedIngredients.map((row) => row.id),
  );

  return referenced;
}

function classifyIngredientRow(
  row: IngredientRow,
  referencedIds: ReadonlySet<string>,
): DiscardAction {
  return classifyDiscardAction({
    createdAt: row.createdAt,
    createdBefore: args.createdBefore,
    hasDownstreamReference: referencedIds.has(row.id),
    isOrphan: isOrphanIngredient(row),
  });
}

function classifyAssetRow(row: AssetRow): DiscardAction {
  return classifyDiscardAction({
    createdAt: row.createdAt,
    createdBefore: args.createdBefore,
    hasDownstreamReference: hasAssetDownstreamReference(row),
    isOrphan: isOrphanAsset(row),
  });
}

async function listMongoEraS3Keys(
  client: S3Client,
  bucket: string,
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        Prefix: 'ingredients/',
      }),
    );
    for (const item of response.Contents ?? []) {
      if (item.Key) {
        keys.push(item.Key);
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

function printSummary(
  ingredientCounts: DiscardCounts,
  assetCounts: DiscardCounts,
  s3Counts: DiscardCounts | null,
): void {
  const rows = [
    toSummaryRow('ingredient', ingredientCounts),
    toSummaryRow('asset', assetCounts),
  ];
  if (s3Counts) {
    rows.push(toSummaryRow('s3-68xx', s3Counts));
  }
  console.log('');
  console.log(formatSummaryTable(rows));
}

async function main(): Promise<void> {
  console.log('='.repeat(72));
  console.log('Discard orphan prod media (#581)');
  console.log('='.repeat(72));
  console.log(`Mode            : ${args.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Env             : ${args.envSuffix}`);
  console.log(`Organization    : ${args.organizationId ?? '(all tenants)'}`);
  console.log(
    `Created before  : ${args.createdBefore?.toISOString() ?? 'unbounded'}`,
  );
  console.log(
    `S3 68xx scan    : ${args.deleteS3 ? 'yes' : 'no (--delete-s3)'}`,
  );
  console.log('='.repeat(72));

  if (args.apply) {
    console.log(
      'APPLY will soft-delete referenced orphans and hard-delete the rest.',
    );
  } else {
    console.log('DRY RUN — no Postgres or S3 objects will be mutated.');
  }

  const prisma = createPrismaClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('Connected to PostgreSQL.');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`PostgreSQL connection failed: ${message}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  try {
    const ingredientWhere = {
      isDeleted: false,
      ...(args.organizationId ? { organizationId: args.organizationId } : {}),
    };
    const assetWhere = {
      isDeleted: false,
      ...(args.organizationId ? { parentOrgId: args.organizationId } : {}),
    };

    const [ingredients, assets, survivingIngredients, survivingAssets] =
      await Promise.all([
        prisma.ingredient.findMany({
          select: {
            cdnUrl: true,
            createdAt: true,
            id: true,
            organizationId: true,
            s3Key: true,
            sampleAudioUrl: true,
          },
          where: ingredientWhere,
        }),
        prisma.asset.findMany({
          select: {
            cloudObjectKey: true,
            createdAt: true,
            id: true,
            parentArticleId: true,
            parentBrandId: true,
            parentIngredientId: true,
            parentOrgId: true,
          },
          where: assetWhere,
        }),
        prisma.ingredient.findMany({
          select: {
            cdnUrl: true,
            id: true,
            s3Key: true,
            sampleAudioUrl: true,
          },
          where: { isDeleted: false },
        }),
        prisma.asset.findMany({
          select: { cloudObjectKey: true },
          where: { isDeleted: false },
        }),
      ]);

    const orphanIngredientIds = ingredients
      .filter((row) => isOrphanIngredient(row))
      .map((row) => row.id);
    const referencedIds = await collectReferencedIngredientIds(
      prisma,
      orphanIngredientIds,
    );

    const ingredientCounts = emptyDiscardCounts();
    const assetCounts = emptyDiscardCounts();
    const ingredientActions = new Map<string, DiscardAction>();
    const assetActions = new Map<string, DiscardAction>();

    for (const row of ingredients) {
      const action = classifyIngredientRow(row, referencedIds);
      ingredientActions.set(row.id, action);
      incrementDiscardCount(ingredientCounts, action);
    }

    for (const row of assets) {
      const action = classifyAssetRow(row);
      assetActions.set(row.id, action);
      incrementDiscardCount(assetCounts, action);
    }

    const survivingKeys = collectSurvivingObjectKeys([
      ...survivingIngredients.flatMap((row) => [row.s3Key, row.cdnUrl]),
      ...survivingAssets.map((row) => row.cloudObjectKey),
    ]);
    for (const row of survivingIngredients) {
      if (!isOrphanIngredient(row) || !ingredientActions.has(row.id)) {
        survivingKeys.add(`ingredients/images/${row.id}`);
        survivingKeys.add(`ingredients/videos/${row.id}`);
        survivingKeys.add(`ingredients/voices/${row.id}`);
        survivingKeys.add(`ingredients/musics/${row.id}`);
        survivingKeys.add(`ingredients/gifs/${row.id}`);
        survivingKeys.add(`ingredients/avatars/${row.id}`);
      }
    }

    let s3Counts: DiscardCounts | null = null;
    const s3DeleteKeys: string[] = [];
    let s3Client: S3Client | null = null;
    let s3Bucket: string | null = null;

    if (args.deleteS3) {
      const created = createS3Client();
      s3Client = created.client;
      s3Bucket = created.bucket;
      const listedKeys = await listMongoEraS3Keys(s3Client, s3Bucket);
      s3Counts = emptyDiscardCounts();
      for (const key of listedKeys) {
        const action = classifyS3Key({ key, survivingKeys });
        incrementDiscardCount(s3Counts, action);
        if (action === 'hard-delete') {
          s3DeleteKeys.push(key);
        }
      }
    }

    if (args.apply) {
      const softIngredientIds = [...ingredientActions.entries()]
        .filter(([, action]) => action === 'soft-delete')
        .map(([id]) => id);
      const hardIngredientIds = [...ingredientActions.entries()]
        .filter(([, action]) => action === 'hard-delete')
        .map(([id]) => id);
      const softAssetIds = [...assetActions.entries()]
        .filter(([, action]) => action === 'soft-delete')
        .map(([id]) => id);
      const hardAssetIds = [...assetActions.entries()]
        .filter(([, action]) => action === 'hard-delete')
        .map(([id]) => id);

      if (softIngredientIds.length > 0) {
        await prisma.ingredient.updateMany({
          data: { isDeleted: true },
          where: {
            id: { in: softIngredientIds },
            isDeleted: false,
            ...(args.organizationId
              ? { organizationId: args.organizationId }
              : {}),
          },
        });
      }
      if (hardIngredientIds.length > 0) {
        await prisma.ingredient.deleteMany({
          where: {
            id: { in: hardIngredientIds },
            isDeleted: false,
            ...(args.organizationId
              ? { organizationId: args.organizationId }
              : {}),
          },
        });
      }
      if (softAssetIds.length > 0) {
        await prisma.asset.updateMany({
          data: { isDeleted: true },
          where: {
            id: { in: softAssetIds },
            isDeleted: false,
            ...(args.organizationId
              ? { parentOrgId: args.organizationId }
              : {}),
          },
        });
      }
      if (hardAssetIds.length > 0) {
        await prisma.asset.deleteMany({
          where: {
            id: { in: hardAssetIds },
            isDeleted: false,
            ...(args.organizationId
              ? { parentOrgId: args.organizationId }
              : {}),
          },
        });
      }
    }

    if (args.apply && args.deleteS3 && s3Client && s3Bucket) {
      for (const key of s3DeleteKeys) {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: s3Bucket,
            Key: key,
          }),
        );
      }
    }

    printSummary(ingredientCounts, assetCounts, s3Counts);
    console.log('');
    if (args.apply) {
      console.log(
        'APPLY complete. Re-run without --apply to verify remaining counts.',
      );
    } else {
      console.log(
        'DRY RUN complete. Pass --apply to mutate. Production was not touched.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Discard orphan media failed: ${message}`);
  process.exit(1);
});
