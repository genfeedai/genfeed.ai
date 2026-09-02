/**
 * Seed harness profiles from private (or fixture) content harness packs.
 *
 * Maps pack seeds → DB harness profiles by brandId / slug / label.
 * TODO examples are dropped. Existing profile examples are merged, not wiped.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/harness-profiles-from-packs.seed.ts
 *   bun run apps/server/api/scripts/seeds/harness-profiles-from-packs.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/harness-profiles-from-packs.seed.ts --organizationId=<id> --live
 *
 * Packs load order:
 * 1. CONTENT_HARNESS_PACKAGES module(s) if resolvable (e.g. @genfeedai/private-harness)
 * 2. Built-in fixture packs under this script (genfeed-shaped demo only)
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  type HarnessPackSeed,
  packSeedMatchesBrand,
} from '@api/services/harness/harness-profile-seed.util';
import { Logger } from '@nestjs/common';

type SeedArgs = {
  dryRun: boolean;
  env?: string;
  organizationId?: string;
};

const logger = new Logger('HarnessProfilePackSeed');

const FIXTURE_PACKS: HarnessPackSeed[] = [
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

function parseArgs(argv: string[]): SeedArgs {
  const args: SeedArgs = { dryRun: true };
  for (const arg of argv) {
    if (arg === '--live') {
      args.dryRun = false;
    } else if (arg.startsWith('--organizationId=')) {
      args.organizationId = arg.slice('--organizationId='.length);
    } else if (arg.startsWith('--env=')) {
      args.env = arg.slice('--env='.length);
    }
  }
  return args;
}

function loadEnvFile(envName?: string): void {
  const candidates = [
    envName ? resolve(process.cwd(), `.env.${envName}`) : null,
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/server/api/.env'),
  ].filter(Boolean) as string[];

  for (const path of candidates) {
    try {
      const raw = readFileSync(path, 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }
        const eq = trimmed.indexOf('=');
        if (eq <= 0) {
          continue;
        }
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      return;
    } catch {
      // try next
    }
  }
}

function extractSeedsFromModule(
  mod: Record<string, unknown>,
): HarnessPackSeed[] {
  const seeds: HarnessPackSeed[] = [];
  const pack =
    (mod.CONTENT_HARNESS_PACK as { contribute?: unknown } | undefined) ??
    (mod.default as { contribute?: unknown } | undefined);

  // Prefer named PRIVATE_PACKS export from private harness.
  const privatePacks = mod.PRIVATE_PACKS;
  if (Array.isArray(privatePacks)) {
    for (const item of privatePacks) {
      const seed = coercePackToSeed(item);
      if (seed) {
        seeds.push(seed);
      }
    }
  }

  if (seeds.length === 0 && pack) {
    const seed = coercePackToSeed(pack);
    if (seed) {
      seeds.push(seed);
    }
  }

  return seeds;
}

function coercePackToSeed(pack: unknown): HarnessPackSeed | null {
  if (!pack || typeof pack !== 'object') {
    return null;
  }
  const record = pack as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : null;
  if (!id) {
    return null;
  }

  // Private packs store seed data only via contribute(input) with brand match.
  // Probe with a synthetic brandName from description or id.
  const description =
    typeof record.description === 'string' ? record.description : '';
  const brandNameMatch = description.match(/for\s+(.+?)\.?$/i);
  const brandName =
    brandNameMatch?.[1]?.trim() || id.replace(/-brand$/, '').replace(/-/g, ' ');

  // If contribute is a function, invoke with matching brandName to extract.
  if (typeof record.contribute === 'function') {
    try {
      const contribution = record.contribute({
        brandName,
        intent: { contentType: 'post', objective: 'engagement' },
      }) as {
        evaluationCriteria?: string[];
        guardrails?: string[];
        sources?: Array<{ content?: string; kind?: string }>;
        styleDirectives?: string[];
        systemDirectives?: string[];
      };
      const examples =
        contribution.sources
          ?.filter((source) => source.kind === 'brand_example')
          .map((source) => source.content)
          .filter((content): content is string => Boolean(content)) ?? [];
      const antiExamples =
        contribution.sources
          ?.filter((source) => source.kind === 'anti_example')
          .map((source) => source.content)
          .filter((content): content is string => Boolean(content)) ?? [];
      return {
        antiExamples,
        brandName,
        brandSlugs: [id.replace(/-brand$/, ''), brandName.toLowerCase()],
        evaluationCriteria: contribution.evaluationCriteria,
        examples,
        guardrails: contribution.guardrails,
        id,
        styleDirectives: contribution.styleDirectives,
        systemDirectives: contribution.systemDirectives,
      };
    } catch {
      return {
        brandName,
        id,
      };
    }
  }

  return {
    brandName,
    id,
  };
}

function loadPackSeeds(): HarnessPackSeed[] {
  const seeds: HarnessPackSeed[] = [...FIXTURE_PACKS];
  const packagesEnv = process.env.CONTENT_HARNESS_PACKAGES ?? '';
  const requireFn = createRequire(import.meta.url);

  for (const specifier of packagesEnv
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)) {
    try {
      const mod = requireFn(specifier) as Record<string, unknown>;
      seeds.push(...extractSeedsFromModule(mod));
      logger.log(`Loaded harness pack module ${specifier}`);
    } catch (error: unknown) {
      logger.warn(
        `Could not load ${specifier}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  return seeds;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFile(args.env);

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../src/app.module');
  const { PrismaService } = await import(
    '../../src/shared/modules/prisma/prisma.service'
  );
  const { HarnessProfilesService } = await import(
    '../../src/collections/harness-profiles/services/harness-profiles.service'
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const harnessProfiles = app.get(HarnessProfilesService);
    const seeds = loadPackSeeds();

    const orgs = await prisma.organization.findMany({
      select: { id: true, label: true },
      where: {
        isDeleted: false,
        ...(args.organizationId ? { id: args.organizationId } : {}),
      },
    });

    let matched = 0;
    let written = 0;

    for (const org of orgs) {
      const brands = await prisma.brand.findMany({
        select: { id: true, label: true, slug: true },
        where: { isDeleted: false, organizationId: org.id },
      });

      const owner = await prisma.member.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
        where: { isDeleted: false, organizationId: org.id },
      });
      if (!owner?.userId) {
        continue;
      }

      for (const brand of brands) {
        for (const seed of seeds) {
          if (!packSeedMatchesBrand(seed, brand)) {
            continue;
          }
          matched += 1;
          logger.log(
            `${args.dryRun ? '[dry-run] ' : ''}Match pack ${seed.id} → brand ${brand.label} (${brand.id}) org ${org.id}`,
          );
          if (args.dryRun) {
            continue;
          }
          await harnessProfiles.upsertSeedForBrand({
            brandId: brand.id,
            organizationId: org.id,
            seed,
            userId: owner.userId,
          });
          written += 1;
        }
      }
    }

    logger.log(
      `Harness profile seed complete. packs=${seeds.length} matches=${matched} written=${written} dryRun=${args.dryRun}`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  logger.error(error);
  process.exitCode = 1;
});
