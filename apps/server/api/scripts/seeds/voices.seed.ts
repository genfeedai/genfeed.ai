/**
 * Seed Script: Voice Catalog
 *
 * Syncs provider voice catalogs into Mongo-backed voice ingredients.
 * Writes to the live `ingredients` + `metadata` collections used by `/voices`.
 *
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/voices.seed.ts
 *   bun run apps/server/api/scripts/seeds/voices.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/voices.seed.ts --live --providers=elevenlabs,heygen
 *   bun run apps/server/api/scripts/seeds/voices.seed.ts --userId=<id> --organizationId=<id> --brandId=<id>
 *   bun run apps/server/api/scripts/seeds/voices.seed.ts --env=production --live --userId=<id> --organizationId=<id> --brandId=<id>
 *   bun run apps/server/api/scripts/seeds/voices.seed.ts --all-clusters
 */

import { spawnSync } from 'node:child_process';
import { runScript } from '@api-scripts/db/connection';
import { parseArgs } from '@api-scripts/db/seed-utils';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  VoiceProvider,
} from '@genfeedai/enums';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { type Db, type Document, ObjectId } from 'mongodb';

const logger = new Logger('VoicesSeed');
const SUPPORTED_CLUSTERS = ['local', 'staging', 'production'] as const;

type SupportedCluster = (typeof SUPPORTED_CLUSTERS)[number];

type CatalogProvider = VoiceProvider.ELEVENLABS | VoiceProvider.HEYGEN;

interface ProviderVoiceRecord {
  externalVoiceId: string;
  label: string;
  provider: CatalogProvider;
  providerData: Record<string, unknown>;
  sampleAudioUrl?: string;
}

interface MetadataDocument extends Document {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  description: string;
  extension: MetadataExtension;
  externalId?: string;
  externalProvider?: string;
  isDeleted: boolean;
  label: string;
  result: string;
}

interface IngredientVoiceDocument extends Document {
  _id: ObjectId;
  brand: ObjectId | null;
  category: IngredientCategory;
  cloneStatus?: string;
  createdAt: Date;
  externalVoiceId?: string;
  isActive?: boolean;
  isCloned?: boolean;
  isDefault: boolean;
  isDefaultSelectable?: boolean;
  isDeleted: boolean;
  isFeatured?: boolean;
  metadata: ObjectId;
  organization: ObjectId | null;
  provider?: CatalogProvider;
  providerData?: Record<string, unknown>;
  sampleAudioUrl?: string;
  scope: AssetScope;
  status: IngredientStatus | string;
  type: 'voice';
  updatedAt: Date;
  user: ObjectId | null;
  version: number;
  voiceSource?: 'catalog' | 'cloned' | 'generated';
}

type SeedCliArgs = ReturnType<typeof parseArgs> & {
  allClusters: boolean;
  brandId?: string;
  env?: string;
  organizationId?: string;
  providers?: CatalogProvider[];
  userId?: string;
};

function parseSeedArgs(): SeedCliArgs {
  const base = parseArgs();
  const args = process.argv.slice(2);
  const env = args.find((arg) => arg.startsWith('--env='))?.split('=')[1];

  const providersArg = args
    .find((arg) => arg.startsWith('--providers='))
    ?.split('=')[1];

  const providers = providersArg
    ? providersArg
        .split(',')
        .map((value) => value.trim())
        .filter(
          (value): value is CatalogProvider =>
            value === VoiceProvider.ELEVENLABS ||
            value === VoiceProvider.HEYGEN,
        )
    : undefined;

  return {
    ...base,
    allClusters: args.includes('--all-clusters'),
    brandId:
      args.find((arg) => arg.startsWith('--brandId='))?.split('=')[1] ??
      process.env.VOICE_SEED_BRAND_ID,
    env,
    organizationId:
      args.find((arg) => arg.startsWith('--organizationId='))?.split('=')[1] ??
      process.env.VOICE_SEED_ORGANIZATION_ID,
    providers,
    userId:
      args.find((arg) => arg.startsWith('--userId='))?.split('=')[1] ??
      process.env.VOICE_SEED_USER_ID,
  };
}

function getSpawnArgsForCluster(cluster: SupportedCluster): string[] {
  const forwardedArgs = process.argv.slice(2).filter((arg) => {
    return !arg.startsWith('--env=') && arg !== '--all-clusters';
  });

  return [process.argv[1]!, `--env=${cluster}`, ...forwardedArgs];
}

function runAllClusters(): void {
  const failures: string[] = [];

  for (const cluster of SUPPORTED_CLUSTERS) {
    logger.log(`\nRunning voice seed for cluster "${cluster}"`);

    const result = spawnSync(
      process.execPath,
      getSpawnArgsForCluster(cluster),
      {
        env: process.env,
        stdio: 'inherit',
      },
    );

    if (result.status !== 0) {
      failures.push(`${cluster}:${result.status ?? 'unknown'}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Voice seed failed for ${failures.length} cluster(s): ${failures.join(', ')}`,
    );
  }
}

function parseOptionalObjectId(value?: string): ObjectId | null {
  if (!value) {
    return null;
  }

  if (!ObjectId.isValid(value)) {
    throw new Error(`Invalid ObjectId: ${value}`);
  }

  return new ObjectId(value);
}

function requireObjectId(name: string, value?: string): ObjectId {
  if (!value || !ObjectId.isValid(value)) {
    throw new Error(
      `${name} is required and must be a valid ObjectId. Pass --${name}=<id> or set VOICE_SEED_${name.replace(/Id$/, '_ID').toUpperCase()}.`,
    );
  }

  return new ObjectId(value);
}

async function fetchElevenLabsVoices(): Promise<ProviderVoiceRecord[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is required to seed ElevenLabs voices');
  }

  const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
    headers: {
      'xi-api-key': apiKey,
    },
  });

  const voices = Array.isArray(response.data?.voices)
    ? response.data.voices
    : [];

  return voices.map((voice: Record<string, unknown>) => ({
    externalVoiceId: String(voice.voice_id),
    label: String(voice.name),
    provider: VoiceProvider.ELEVENLABS,
    providerData: {},
    sampleAudioUrl:
      typeof voice.preview_url === 'string' && voice.preview_url.length > 0
        ? voice.preview_url
        : undefined,
  }));
}

async function fetchHeyGenVoices(): Promise<ProviderVoiceRecord[]> {
  const apiKey = process.env.HEYGEN_API_KEY;

  if (!apiKey) {
    throw new Error('HEYGEN_API_KEY is required to seed HeyGen voices');
  }

  const response = await axios.get('https://api.heygen.com/v2/voices', {
    headers: {
      'x-api-key': apiKey,
    },
  });

  const voices = Array.isArray(response.data?.data?.voices)
    ? response.data.data.voices
    : Array.isArray(response.data?.data)
      ? response.data.data
      : [];

  return voices.map((voice: Record<string, unknown>, index: number) => ({
    externalVoiceId: String(voice.voice_id ?? voice.id ?? `voice_${index}`),
    label: String(voice.voice_name ?? voice.name ?? `Voice ${index + 1}`),
    provider: VoiceProvider.HEYGEN,
    providerData: { index },
    sampleAudioUrl:
      typeof voice.preview_url === 'string' && voice.preview_url.length > 0
        ? voice.preview_url
        : typeof voice.preview === 'string' && voice.preview.length > 0
          ? voice.preview
          : undefined,
  }));
}

async function fetchProviderVoices(
  providers: CatalogProvider[],
): Promise<ProviderVoiceRecord[]> {
  const records: ProviderVoiceRecord[] = [];

  if (providers.includes(VoiceProvider.ELEVENLABS)) {
    records.push(...(await fetchElevenLabsVoices()));
  }

  if (providers.includes(VoiceProvider.HEYGEN)) {
    records.push(...(await fetchHeyGenVoices()));
  }

  return records;
}

async function upsertCatalogVoice(
  db: Db,
  voice: ProviderVoiceRecord,
  owner: {
    brand: ObjectId | null;
    organization: ObjectId | null;
    user: ObjectId | null;
  },
  dryRun: boolean,
): Promise<'inserted' | 'updated' | 'unchanged'> {
  const ingredients = db.collection<IngredientVoiceDocument>('ingredients');
  const metadata = db.collection<MetadataDocument>('metadata');
  const now = new Date();

  const existing = await ingredients.findOne({
    category: IngredientCategory.VOICE,
    externalVoiceId: voice.externalVoiceId,
    isDeleted: false,
    provider: voice.provider,
    type: 'voice',
    voiceSource: 'catalog',
  });

  if (existing) {
    const nextVoiceFields = {
      externalVoiceId: voice.externalVoiceId,
      isCloned: false,
      provider: voice.provider,
      providerData: voice.providerData,
      sampleAudioUrl: voice.sampleAudioUrl,
      scope:
        owner.organization || owner.brand || owner.user
          ? AssetScope.ORGANIZATION
          : AssetScope.PUBLIC,
      status: IngredientStatus.UPLOADED,
      voiceSource: 'catalog' as const,
    };

    const currentVoiceFields = {
      externalVoiceId: existing.externalVoiceId,
      isCloned: existing.isCloned,
      provider: existing.provider,
      providerData: existing.providerData ?? {},
      sampleAudioUrl: existing.sampleAudioUrl,
      scope: existing.scope,
      status: existing.status,
      voiceSource: existing.voiceSource,
    };

    const metadataDoc = await metadata.findOne({ _id: existing.metadata });
    const labelChanged = metadataDoc?.label !== voice.label;
    const providerChanged =
      metadataDoc?.externalProvider !== voice.provider ||
      metadataDoc?.externalId !== voice.externalVoiceId;
    const voiceChanged =
      JSON.stringify(currentVoiceFields) !== JSON.stringify(nextVoiceFields);

    if (!labelChanged && !providerChanged && !voiceChanged) {
      return 'unchanged';
    }

    if (dryRun) {
      return 'updated';
    }

    if (labelChanged || providerChanged) {
      await metadata.updateOne(
        { _id: existing.metadata },
        {
          $set: {
            externalId: voice.externalVoiceId,
            externalProvider: voice.provider,
            label: voice.label,
            updatedAt: now,
          },
        },
      );
    }

    if (voiceChanged) {
      await ingredients.updateOne(
        { _id: existing._id },
        {
          $set: {
            ...nextVoiceFields,
            updatedAt: now,
          },
        },
      );
    }

    return 'updated';
  }

  if (dryRun) {
    return 'inserted';
  }

  const metadataId = new ObjectId();
  await metadata.insertOne({
    _id: metadataId,
    createdAt: now,
    description: 'Default Description',
    extension: MetadataExtension.MP3,
    externalId: voice.externalVoiceId,
    externalProvider: voice.provider,
    isDeleted: false,
    label: voice.label,
    result: '',
    updatedAt: now,
  });

  await ingredients.insertOne({
    _id: new ObjectId(),
    brand: owner.brand,
    category: IngredientCategory.VOICE,
    createdAt: now,
    externalVoiceId: voice.externalVoiceId,
    isActive: true,
    isCloned: false,
    isDefault: false,
    isDefaultSelectable: true,
    isDeleted: false,
    isFavorite: false,
    isFeatured: false,
    isHighlighted: false,
    isPublic: false,
    metadata: metadataId,
    order: 0,
    organization: owner.organization,
    provider: voice.provider,
    providerData: voice.providerData,
    sampleAudioUrl: voice.sampleAudioUrl,
    scope:
      owner.organization || owner.brand || owner.user
        ? AssetScope.ORGANIZATION
        : AssetScope.PUBLIC,
    status: IngredientStatus.UPLOADED,
    tags: [],
    transformations: [],
    type: 'voice',
    updatedAt: now,
    user: owner.user,
    version: 1,
    voiceSource: 'catalog',
  } as IngredientVoiceDocument);

  return 'inserted';
}

const args = parseSeedArgs();

if (args.allClusters) {
  try {
    runAllClusters();
    process.exit(0);
  } catch (error) {
    logger.error('Voice seed failed across clusters', error);
    process.exit(1);
  }
}

runScript(
  `Voice Catalog Seed${args.env ? ` (${args.env})` : ''}`,
  async (db) => {
    const dryRun = args.dryRun;
    const providers =
      args.providers && args.providers.length > 0
        ? args.providers
        : [VoiceProvider.ELEVENLABS, VoiceProvider.HEYGEN];

    const owner = {
      brand: parseOptionalObjectId(args.brandId),
      organization: parseOptionalObjectId(args.organizationId),
      user: parseOptionalObjectId(args.userId),
    };

    if (!owner.brand && !owner.organization && !owner.user) {
      logger.log(
        'No owner IDs provided. Seeding voices as global Genfeed catalog records (brand/org/user = null, scope = public).',
      );
    }

    const voices = await fetchProviderVoices(providers);
    let inserted = 0;
    let unchanged = 0;
    let updated = 0;

    logger.log(
      `${dryRun ? 'DRY RUN' : 'LIVE'} syncing ${voices.length} voices from ${providers.join(', ')}`,
    );

    for (const voice of voices) {
      const result = await upsertCatalogVoice(db, voice, owner, dryRun);

      if (result === 'inserted') {
        inserted += 1;
      }
      if (result === 'updated') {
        updated += 1;
      }
      if (result === 'unchanged') {
        unchanged += 1;
      }
    }

    logger.log(`Inserted: ${inserted}`);
    logger.log(`Updated: ${updated}`);
    logger.log(`Unchanged: ${unchanged}`);
  },
  {
    database: args.database,
    uri: args.uri,
  },
).catch((error) => {
  logger.error('Voice seed failed', error);
  process.exit(1);
});
