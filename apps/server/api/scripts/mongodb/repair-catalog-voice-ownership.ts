/**
 * Repair provider-backed catalog voice metadata and ownership shape.
 *
 * Dry-run by default. Pass `--live` to apply changes.
 *
 * Safe repairs only:
 * - backfill `provider` from `metadata.externalProvider` when supported
 * - backfill `externalVoiceId` from `metadata.externalId`
 * - backfill `voiceSource: 'catalog'` for provider-backed imported defaults
 * - re-scope fully ownerless provider-backed catalog voices to `scope: 'public'`
 *
 * Usage:
 *   bun run apps/server/api/scripts/mongodb/repair-catalog-voice-ownership.ts
 *   bun run apps/server/api/scripts/mongodb/repair-catalog-voice-ownership.ts --env=production
 *   bun run apps/server/api/scripts/mongodb/repair-catalog-voice-ownership.ts --live
 *   bun run apps/server/api/scripts/mongodb/repair-catalog-voice-ownership.ts --env=production --live
 */

import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { getClient, runScript } from '@api-scripts/db/connection';
import { parseArgs } from '@api-scripts/db/seed-utils';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { type Document, ObjectId } from 'mongodb';

const logger = {
  error: (...args: unknown[]) => console.error(...args),
  log: (...args: unknown[]) => console.log(...args),
};

const SUPPORTED_CATALOG_PROVIDERS = new Set(['elevenlabs', 'heygen']);

interface IngredientVoiceDocument extends Document {
  _id: ObjectId;
  brand?: ObjectId | null;
  category: string;
  externalVoiceId?: string | null;
  isCloned?: boolean;
  isDefault?: boolean;
  isDeleted?: boolean;
  metadata?: ObjectId | null;
  organization?: ObjectId | null;
  provider?: string | null;
  scope?: string | null;
  status?: string | null;
  user?: ObjectId | null;
  voiceSource?: string | null;
}

interface MetadataDocument extends Document {
  _id: ObjectId;
  externalId?: string | null;
  externalProvider?: string | null;
  label?: string | null;
}

const args = parseArgs();

function normalizeProvider(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return SUPPORTED_CATALOG_PROVIDERS.has(normalized) ? normalized : undefined;
}

function normalizeExternalId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isCatalogImportCandidate(
  doc: IngredientVoiceDocument,
  provider: string | undefined,
  externalVoiceId: string | undefined,
): boolean {
  if (doc.category !== IngredientCategory.VOICE) {
    return false;
  }

  if (provider == null || externalVoiceId == null) {
    return false;
  }

  if (doc.status !== IngredientStatus.UPLOADED) {
    return false;
  }

  if (doc.isCloned === true) {
    return false;
  }

  return doc.voiceSource === 'catalog' || doc.isDefault === true;
}

runScript(
  'Repair catalog voice ownership',
  async () => {
    const client = getClient();
    const cloud = client.db(DB_CONNECTIONS.CLOUD);

    const ingredients =
      cloud.collection<IngredientVoiceDocument>('ingredients');
    const metadata = cloud.collection<MetadataDocument>('metadata');

    const voiceDocs = await ingredients
      .find({
        category: IngredientCategory.VOICE,
        isDeleted: { $ne: true },
      })
      .project({
        _id: 1,
        brand: 1,
        category: 1,
        externalVoiceId: 1,
        isCloned: 1,
        isDefault: 1,
        metadata: 1,
        organization: 1,
        provider: 1,
        scope: 1,
        status: 1,
        user: 1,
        voiceSource: 1,
      })
      .toArray();

    const metadataIds = [
      ...new Set(
        voiceDocs
          .map((doc) => doc.metadata)
          .filter((value): value is ObjectId => value instanceof ObjectId)
          .map((value) => value.toHexString()),
      ),
    ].map((value) => new ObjectId(value));

    const metadataDocs = await metadata
      .find({ _id: { $in: metadataIds } })
      .project({
        _id: 1,
        externalId: 1,
        externalProvider: 1,
        label: 1,
      })
      .toArray();

    const metadataById = new Map(
      metadataDocs.map((doc) => [doc._id.toHexString(), doc] as const),
    );

    let docsScanned = 0;
    let docsToUpdate = 0;
    let providerBackfills = 0;
    let externalIdBackfills = 0;
    let voiceSourceBackfills = 0;
    let scopeRepairs = 0;

    for (const doc of voiceDocs) {
      docsScanned++;

      const metadataDoc =
        doc.metadata instanceof ObjectId
          ? metadataById.get(doc.metadata.toHexString())
          : undefined;

      const provider =
        normalizeProvider(doc.provider) ??
        normalizeProvider(metadataDoc?.externalProvider);
      const externalVoiceId =
        normalizeExternalId(doc.externalVoiceId) ??
        normalizeExternalId(metadataDoc?.externalId);

      const isOwnerless =
        doc.user == null && doc.organization == null && doc.brand == null;
      const isCatalogCandidate = isCatalogImportCandidate(
        doc,
        provider,
        externalVoiceId,
      );

      const patch: Partial<IngredientVoiceDocument> & {
        updatedAt?: Date;
      } = {};

      if (normalizeProvider(doc.provider) == null && provider != null) {
        patch.provider = provider;
        providerBackfills++;
      }

      if (
        normalizeExternalId(doc.externalVoiceId) == null &&
        externalVoiceId != null
      ) {
        patch.externalVoiceId = externalVoiceId;
        externalIdBackfills++;
      }

      if (doc.voiceSource == null && isCatalogCandidate) {
        patch.voiceSource = 'catalog';
        voiceSourceBackfills++;
      }

      if (
        isOwnerless &&
        isCatalogCandidate &&
        (patch.voiceSource === 'catalog' || doc.voiceSource === 'catalog') &&
        doc.scope !== AssetScope.PUBLIC
      ) {
        patch.scope = AssetScope.PUBLIC;
        scopeRepairs++;
      }

      if (Object.keys(patch).length === 0) {
        continue;
      }

      docsToUpdate++;

      const label = metadataDoc?.label?.trim() || '(unlabeled voice)';
      const fields = Object.keys(patch).join(', ');

      if (args.dryRun) {
        logger.log(
          `[DRY RUN] Would patch voice ${String(doc._id)} (${label}): ${fields}`,
        );
      } else {
        await ingredients.updateOne(
          { _id: doc._id, isDeleted: { $ne: true } },
          {
            $set: {
              ...patch,
              updatedAt: new Date(),
            },
          },
        );
        logger.log(`🔄 Patched voice ${String(doc._id)} (${label}): ${fields}`);
      }
    }

    logger.log('');
    logger.log('═'.repeat(80));
    logger.log(`CATALOG VOICE ${args.dryRun ? 'DRY-RUN ' : ''}SUMMARY`);
    logger.log('═'.repeat(80));
    logger.log(`Docs scanned: ${docsScanned}`);
    logger.log(
      `${args.dryRun ? '[DRY RUN] Would update docs' : 'Updated docs'}: ${docsToUpdate}`,
    );
    logger.log(`Provider backfills: ${providerBackfills}`);
    logger.log(`External voice ID backfills: ${externalIdBackfills}`);
    logger.log(`voiceSource backfills: ${voiceSourceBackfills}`);
    logger.log(`Scope repairs to public: ${scopeRepairs}`);

    return {
      docsScanned,
      docsToUpdate,
      dryRun: args.dryRun,
      externalIdBackfills,
      providerBackfills,
      scopeRepairs,
      voiceSourceBackfills,
    };
  },
  {
    database: DB_CONNECTIONS.CLOUD,
    uri: args.uri,
  },
).catch((error) => {
  logger.error('catalog voice ownership repair failed', error);
  process.exit(1);
});
