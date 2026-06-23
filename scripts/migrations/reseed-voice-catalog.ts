/**
 * Reseed Voice Catalog Script
 *
 * Populates the `external_voices` table from the live provider catalogs
 * (ElevenLabs + HeyGen) — the exact same work `POST /voices/import` performs
 * via ExternalVoiceCatalogService.syncFromProviders(). The HTTP endpoint is
 * super-admin (legacy auth provider) gated and cannot be driven non-interactively, so this
 * standalone script mirrors the upsert logic 1:1 and runs against prod RDS the
 * same way the other migration scripts do (dotenv-loaded .env.<env>, secrets
 * never printed).
 *
 * Faithful to external-voice-catalog.service.ts#syncFromProviders:
 *   - ElevenLabs: ElevenLabsClient(apiKey).voices.getAll() → {voiceId,name,preview}
 *     upsert create { providerData: {}, sampleAudioUrl: preview ?? null }
 *   - HeyGen: GET https://api.heygen.com/v2/voices  (X-Api-Key header)
 *     map → {voiceId,name,preview,index}
 *     upsert create { providerData: { index }, sampleAudioUrl: preview || null }
 *   - compound unique: externalProvider_externalId
 *   - created vs updated detected via createdAt≈updatedAt (<1s)
 *
 * Idempotent (upsert) + additive — safe to re-run. Dry-run by default.
 *
 * Env vars (loaded from apps/server/api/.env.<env>):
 *   DATABASE_URL, ELEVENLABS_API_KEY, HEYGEN_KEY
 *
 * Usage:
 *   bun run scripts/migrations/reseed-voice-catalog.ts                          # dry-run local
 *   bun run scripts/migrations/reseed-voice-catalog.ts --env=production         # dry-run prod
 *   bun run scripts/migrations/reseed-voice-catalog.ts --env=production --live  # live prod
 *   bun run scripts/migrations/reseed-voice-catalog.ts --env=production --live --providers=elevenlabs
 */

import { resolve } from 'node:path';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../../packages/prisma/src/index';
import { normalizePgUrl } from './_pg-ssl';

const logger = new Logger('ReseedVoiceCatalog');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const envArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
const envSuffix = envArg ?? 'local';
config({ path: resolve(__dirname, `../../apps/server/api/.env.${envSuffix}`) });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(`DATABASE_URL is required (loaded from .env.${envSuffix})`);
}

const DRY_RUN = !process.argv.includes('--live');

const providersArg = process.argv
  .find((a) => a.startsWith('--providers='))
  ?.split('=')[1];

// Prisma VoiceProvider members are UPPERCASE string values.
const PROVIDER_ELEVENLABS = 'ELEVENLABS' as const;
const PROVIDER_HEYGEN = 'HEYGEN' as const;
type SyncableProvider = typeof PROVIDER_ELEVENLABS | typeof PROVIDER_HEYGEN;

const targetProviders: SyncableProvider[] = providersArg
  ? providersArg
      .split(',')
      .map((p) => p.trim().toUpperCase())
      .filter(
        (p): p is SyncableProvider =>
          p === PROVIDER_ELEVENLABS || p === PROVIDER_HEYGEN,
      )
  : [PROVIDER_ELEVENLABS, PROVIDER_HEYGEN];

if (targetProviders.length === 0) {
  throw new Error(
    'No valid providers selected. Use --providers=elevenlabs,heygen',
  );
}

if (DRY_RUN) {
  logger.log('[DRY RUN] No rows will be written. Pass --live to upsert.');
} else {
  logger.warn('[LIVE MODE] Rows WILL be upserted into external_voices.');
}

// ---------------------------------------------------------------------------
// Prisma client
// ---------------------------------------------------------------------------

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: normalizePgUrl(databaseUrl),
  });
  // biome-ignore lint/suspicious/noExplicitAny: PrismaClient ctor accepts adapter
  return new PrismaClient({ adapter } as any);
}

// ---------------------------------------------------------------------------
// Provider fetchers (mirror getVoices() in the integration services)
// ---------------------------------------------------------------------------

interface CatalogVoice {
  voiceId: string;
  name: string;
  preview: string | null;
  index?: number;
}

async function fetchElevenLabsVoices(): Promise<CatalogVoice[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not set');
  }
  const client = new ElevenLabsClient({ apiKey });
  const voices = await client.voices.getAll();
  return voices.voices.map((voice) => ({
    name: voice.name ?? 'Untitled Voice',
    preview: voice.previewUrl ?? null,
    voiceId: voice.voiceId,
  }));
}

async function fetchHeyGenVoices(): Promise<CatalogVoice[]> {
  const apiKey = process.env.HEYGEN_KEY;
  if (!apiKey) {
    throw new Error('HEYGEN_KEY is not set');
  }
  const res = await fetch('https://api.heygen.com/v2/voices', {
    headers: { 'X-Api-Key': apiKey, accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HeyGen API returned ${res.status}`);
  }
  const body = (await res.json()) as {
    data?: { voices?: unknown[] } | unknown[];
  };
  const data = body?.data as { voices?: unknown[] } | unknown[] | undefined;
  const voices: unknown[] = Array.isArray(data)
    ? data
    : ((data as { voices?: unknown[] })?.voices ?? []);
  return voices.map((voice, index) => {
    const v = voice as Record<string, unknown>;
    return {
      index,
      name: String(v.voice_name ?? v.name ?? `Voice ${index + 1}`),
      preview: String(v.preview_url ?? v.preview ?? '') || null,
      voiceId: String(v.voice_id ?? v.id ?? `voice_${index}`),
    };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.log('='.repeat(72));
  logger.log('Reseed Voice Catalog (external_voices)');
  logger.log('='.repeat(72));
  logger.log(`Mode      : ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  logger.log(`Env       : ${envSuffix}`);
  logger.log(`Providers : ${targetProviders.join(', ')}`);
  logger.log('='.repeat(72));

  const prisma = createPrismaClient();
  // biome-ignore lint/suspicious/noExplicitAny: dynamic prisma client
  const prismaAny = prisma as any;

  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.log('Connected to PostgreSQL.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`PostgreSQL connection failed: ${msg}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  let created = 0;
  let updated = 0;

  for (const provider of targetProviders) {
    logger.log('');
    logger.log('─'.repeat(60));
    logger.log(provider);
    logger.log('─'.repeat(60));

    let voices: CatalogVoice[];
    try {
      voices =
        provider === PROVIDER_ELEVENLABS
          ? await fetchElevenLabsVoices()
          : await fetchHeyGenVoices();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`${provider} fetch failed: ${msg}`);
      continue;
    }

    logger.log(`Fetched ${voices.length} voices from ${provider}.`);

    for (const voice of voices) {
      const providerData =
        provider === PROVIDER_HEYGEN ? { index: voice.index } : {};

      if (DRY_RUN) {
        logger.log(
          `  [DRY RUN] upsert ${provider} ${voice.voiceId} (${voice.name})`,
        );
        continue;
      }

      const result = await prismaAny.externalVoice.upsert({
        create: {
          externalId: voice.voiceId,
          externalProvider: provider,
          isActive: true,
          isDefaultSelectable: true,
          isFeatured: false,
          name: voice.name,
          providerData,
          sampleAudioUrl: voice.preview,
        },
        update: {
          name: voice.name,
          providerData,
          sampleAudioUrl: voice.preview,
        },
        where: {
          externalProvider_externalId: {
            externalId: voice.voiceId,
            externalProvider: provider,
          },
        },
      });

      const wasCreated =
        Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) <
        1000;
      if (wasCreated) {
        created++;
      } else {
        updated++;
      }
    }
  }

  // ------------------------------------------------------------------
  // Summary + post-state count
  // ------------------------------------------------------------------

  logger.log('');
  logger.log('='.repeat(72));
  if (DRY_RUN) {
    logger.log('[DRY RUN] No rows written. Re-run with --live to upsert.');
  } else {
    const total = created + updated;
    logger.log(`Created : ${created}`);
    logger.log(`Updated : ${updated}`);
    logger.log(`Total   : ${total}`);

    const liveCount: number = await prismaAny.externalVoice.count({
      where: { isActive: true },
    });
    logger.log(`Active external_voices rows now: ${liveCount}`);
  }
  logger.log('='.repeat(72));

  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
