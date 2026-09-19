/**
 * Seed harness profiles from private (or fixture) brand seeds.
 *
 * Writes org-scoped DB harness profiles, so private brand voice reaches the
 * runtime without shipping a private package in the server image.
 *
 * Scope is resolved from the owner, never from brand names: `--ownerEmail`
 * selects the organizations that user owns, and packs are matched only to
 * brands inside them (by brand id, then slug, then label). A brand that happens
 * to share a name in another tenant is never considered.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/harness-profiles-from-packs.seed.ts --ownerEmail=<email>
 *   bun run apps/server/api/scripts/seeds/harness-profiles-from-packs.seed.ts --env=production --ownerEmail=<email> --packs=@genfeedai/private-harness
 *   bun run apps/server/api/scripts/seeds/harness-profiles-from-packs.seed.ts --env=production --ownerEmail=<email> --organizationId=<id> --packs=<path-or-package> --live
 *
 * Seed sources, in order:
 * 1. `--packs=<package-or-path>`: a module exporting `PRIVATE_HARNESS_SEEDS`.
 * 2. `HARNESS_SEED_*` env vars: one JSON seed each, optionally `gz:`-prefixed
 *    base64 gzip. The hosted `harness-profile-seed` ECS task injects them from
 *    the `harness_seed_ssm_path` SSM parameters, so private voice never enters
 *    the public image.
 * 3. The genfeed-shaped fixture seed, for local development only.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import {
  type HarnessPackSeed,
  packSeedMatchesBrand,
} from '@api/services/harness/harness-profile-seed.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from '@libs/prisma/prisma-pg-config';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

type SeedArgs = {
  dryRun: boolean;
  env?: string;
  organizationId?: string;
  ownerEmail?: string;
  packs?: string;
  validateRuntime: boolean;
};

const logger = new Logger('HarnessProfilePackSeed');
const LOCAL_DATABASE_HOSTS = ['0.0.0.0', '127.0.0.1', '::1', 'localhost'];
const SEED_ENV_PREFIX = 'HARNESS_SEED_';
const GZIP_SEED_PREFIX = 'gz:';
const scriptDir = fileURLToPath(new URL('.', import.meta.url));

const FIXTURE_SEEDS: HarnessPackSeed[] = [
  {
    brandName: 'genfeed.ai',
    brandSlugs: ['genfeed', 'genfeedai'],
    doNotSoundLike: [
      'social media guru spam',
      'generic AI SaaS landing page copy',
    ],
    examples: [
      'Ship the content OS, not another wrapper that forgets your brand tomorrow.',
    ],
    handles: ['@genfeedai'],
    id: 'fixture-genfeed-brand',
    offer:
      'AI operating system for world-class branded content with memory and voice fidelity',
    styleDirectives: [
      'Premium, product-led, anti-generic.',
      'Lead with why the system matters, then what it does.',
    ],
    systemDirectives: [
      'Position Genfeed as infrastructure for brand-native content.',
    ],
  },
];

function readArg(args: readonly string[], name: string): string | undefined {
  const value = args
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
    .trim();
  return value ? value : undefined;
}

export function parseHarnessSeedArgs(args: readonly string[]): SeedArgs {
  return {
    dryRun: !args.includes('--live'),
    env: readArg(args, 'env'),
    organizationId: readArg(args, 'organizationId'),
    ownerEmail: readArg(args, 'ownerEmail'),
    packs: readArg(args, 'packs'),
    validateRuntime: args.includes('--validate-runtime'),
  };
}

/**
 * `--env=<name>` overrides values Bun already auto-loaded from `.env` /
 * `.env.local`; otherwise a "production" run would silently hit the local DB.
 */
function loadEnvFile(envArg?: string): void {
  const envSuffix = envArg || 'local';
  const envPath = resolve(scriptDir, '..', '..', `.env.${envSuffix}`);

  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed
        .slice(eqIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (envArg || !process.env[key]) {
        process.env[key] = value;
      }
    }
    logger.log(`Loaded env from .env.${envSuffix}`);
  } catch {
    logger.log(`No .env.${envSuffix} found, using process env`);
  }
}

export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    const hostname = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '');
    return LOCAL_DATABASE_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

function createPrismaClient(envName?: string): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const target = new URL(connectionString);
  logger.log(`Target database: ${target.hostname}${target.pathname}`);
  if (envName === 'production' && isLocalDatabaseUrl(connectionString)) {
    throw new Error(
      '.env.production points at a local database; refusing to report a local run as production',
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg(
      createPrismaPgConfig(connectionString, {
        caFilePaths: POSTGRES_CA_FILE_ENV_KEYS.map((key) => process.env[key]),
      }),
    ),
  });
}

function isHarnessPackSeed(value: unknown): value is HarnessPackSeed {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<HarnessPackSeed>;
  return (
    typeof candidate.id === 'string' && typeof candidate.brandName === 'string'
  );
}

function parseSeedValue(name: string, raw: string): HarnessPackSeed {
  const json = raw.startsWith(GZIP_SEED_PREFIX)
    ? gunzipSync(
        Buffer.from(raw.slice(GZIP_SEED_PREFIX.length), 'base64'),
      ).toString('utf8')
    : raw;
  const value: unknown = JSON.parse(json);
  if (!isHarnessPackSeed(value)) {
    throw new Error(`${name} is not a harness seed (needs id and brandName)`);
  }
  return value;
}

export function loadEnvSeeds(env: NodeJS.ProcessEnv): HarnessPackSeed[] {
  return Object.keys(env)
    .filter((name) => name.startsWith(SEED_ENV_PREFIX) && env[name])
    .sort()
    .map((name) => parseSeedValue(name, env[name] as string));
}

export function loadSeeds(
  specifier?: string,
  env: NodeJS.ProcessEnv = process.env,
): HarnessPackSeed[] {
  if (!specifier) {
    const envSeeds = loadEnvSeeds(env);
    return envSeeds.length > 0 ? envSeeds : FIXTURE_SEEDS;
  }

  const requireFn = createRequire(resolve(process.cwd(), 'package.json'));
  const mod = requireFn(specifier) as { PRIVATE_HARNESS_SEEDS?: unknown };
  const seeds = Array.isArray(mod.PRIVATE_HARNESS_SEEDS)
    ? mod.PRIVATE_HARNESS_SEEDS.filter(isHarnessPackSeed)
    : [];
  if (seeds.length === 0) {
    throw new Error(`${specifier} exports no PRIVATE_HARNESS_SEEDS`);
  }
  return seeds;
}

async function resolveOwnerOrganizations(params: {
  organizationId?: string;
  ownerEmail: string;
  prisma: PrismaClient;
}): Promise<Array<{ id: string; label: string; ownerUserId: string }>> {
  const owner = await params.prisma.user.findFirst({
    select: { id: true },
    where: { email: params.ownerEmail, isDeleted: false },
  });
  if (!owner) {
    throw new Error(`No active user found for email ${params.ownerEmail}`);
  }

  const organizations = await params.prisma.organization.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, label: true },
    where: {
      isDeleted: false,
      userId: owner.id,
      ...(params.organizationId ? { id: params.organizationId } : {}),
    },
  });
  if (organizations.length === 0) {
    throw new Error(
      `${params.ownerEmail} owns no matching organization${params.organizationId ? ` with id ${params.organizationId}` : ''}`,
    );
  }

  return organizations.map((organization) => ({
    ...organization,
    ownerUserId: owner.id,
  }));
}

export async function runHarnessProfileSeed(): Promise<void> {
  const args = parseHarnessSeedArgs(process.argv.slice(2));
  if (args.validateRuntime) {
    logger.log('Harness profile seed runtime OK');
    return;
  }
  loadEnvFile(args.env);

  if (!args.ownerEmail) {
    throw new Error(
      'Pass --ownerEmail=<email>: packs are matched only inside that owner’s organizations',
    );
  }
  if (args.organizationId && !isEntityId(args.organizationId)) {
    throw new Error(`Invalid organization id: ${args.organizationId}`);
  }
  const seeds = loadSeeds(args.packs);
  if (args.env === 'production' && seeds === FIXTURE_SEEDS) {
    throw new Error(
      'A production run needs private seeds: pass --packs=<package-or-path> or inject HARNESS_SEED_* from SSM',
    );
  }
  const prisma = createPrismaClient(args.env);
  const harnessProfiles = new HarnessProfilesService(
    prisma as unknown as PrismaService,
    logger as unknown as LoggerService,
  );

  try {
    const organizations = await resolveOwnerOrganizations({
      organizationId: args.organizationId,
      ownerEmail: args.ownerEmail,
      prisma,
    });

    let matched = 0;
    let written = 0;
    const unmatched = new Set(seeds.map((seed) => seed.id));

    for (const organization of organizations) {
      const brands = await prisma.brand.findMany({
        select: { id: true, label: true, slug: true },
        where: { isDeleted: false, organizationId: organization.id },
      });

      for (const brand of brands) {
        for (const seed of seeds) {
          if (!packSeedMatchesBrand(seed, brand)) {
            continue;
          }
          matched += 1;
          unmatched.delete(seed.id);
          logger.log(
            `${args.dryRun ? '[dry-run] ' : ''}Match ${seed.id} → brand ${brand.label} (${brand.id}) org ${organization.label} (${organization.id})`,
          );
          if (args.dryRun) {
            continue;
          }
          await harnessProfiles.upsertSeedForBrand({
            brandId: brand.id,
            organizationId: organization.id,
            seed,
            userId: organization.ownerUserId,
          });
          written += 1;
        }
      }
    }

    for (const seedId of unmatched) {
      logger.warn(`No brand matched ${seedId} in the owner's organizations`);
    }

    logger.log(
      `Harness profile seed complete. orgs=${organizations.length} seeds=${seeds.length} matches=${matched} written=${written} dryRun=${args.dryRun}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  void runHarnessProfileSeed().catch((error: unknown) => {
    logger.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
