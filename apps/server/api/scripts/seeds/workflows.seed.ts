/**
 * Seed Script: Default Recurring Workflows
 *
 * Provisions the default recurring workflow bundle for existing brands.
 * Dry-run is the default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --live
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --brandId=<id>
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --organizationId=<id>
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --userId=<id>
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --env=production --live
 *   bun run apps/server/api/scripts/seeds/workflows.seed.ts --all-clusters
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '@api/app.module';
import {
  Brand,
  type BrandDocument,
} from '@api/collections/brands/schemas/brand.schema';
import { DefaultRecurringContentService } from '@api/collections/brands/services/default-recurring-content.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';

const logger = new Logger('WorkflowsSeed');
const SUPPORTED_CLUSTERS = ['local', 'staging', 'production'] as const;

type SupportedCluster = (typeof SUPPORTED_CLUSTERS)[number];

type SeedArgs = {
  allClusters: boolean;
  brandId?: string;
  dryRun: boolean;
  env?: string;
  organizationId?: string;
  userId?: string;
};

function loadEnvFile(): void {
  const args = process.argv.slice(2);
  const envArg = args.find((arg) => arg.startsWith('--env='))?.split('=')[1];
  const envSuffix = envArg || 'local';
  const envPath = resolve(__dirname, '..', '..', `.env.${envSuffix}`);

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
      const value = trimmed.slice(eqIndex + 1).trim();
      if (envArg || !process.env[key]) {
        process.env[key] = value;
      }
    }
    logger.log(`Loaded env from .env.${envSuffix}`);
  } catch {
    logger.log(`No .env.${envSuffix} found, using process env / defaults`);
  }
}

function parseArgs(): SeedArgs {
  const args = process.argv.slice(2);

  return {
    allClusters: args.includes('--all-clusters'),
    brandId: args.find((arg) => arg.startsWith('--brandId='))?.split('=')[1],
    dryRun: !args.includes('--live'),
    env: args.find((arg) => arg.startsWith('--env='))?.split('=')[1],
    organizationId: args
      .find((arg) => arg.startsWith('--organizationId='))
      ?.split('=')[1],
    userId: args.find((arg) => arg.startsWith('--userId='))?.split('=')[1],
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
    logger.log(`Running workflow seed for cluster "${cluster}"`);

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
      `Workflow seed failed for ${failures.length} cluster(s): ${failures.join(', ')}`,
    );
  }
}

function parseOptionalObjectId(value?: string): Types.ObjectId | null {
  if (!value) {
    return null;
  }

  if (!Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ObjectId: ${value}`);
  }

  return new Types.ObjectId(value);
}

async function main(): Promise<void> {
  loadEnvFile();

  const args = parseArgs();

  if (args.allClusters) {
    runAllClusters();
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'log', 'warn'],
  });

  try {
    const defaultRecurringContentService = app.get(
      DefaultRecurringContentService,
    );
    const brandModel = app.get<Model<BrandDocument>>(
      getModelToken(Brand.name, DB_CONNECTIONS.CLOUD),
    );

    const filters: Record<string, unknown> = { isDeleted: false };
    const brandId = parseOptionalObjectId(args.brandId);
    const organizationId = parseOptionalObjectId(args.organizationId);

    if (brandId) {
      filters._id = brandId;
    }

    if (organizationId) {
      filters.organization = organizationId;
    }

    const brands = await brandModel.find(filters).sort({ createdAt: 1 }).exec();

    logger.log(
      `${args.dryRun ? 'DRY RUN' : 'LIVE'} evaluating ${brands.length} brand(s)${args.env ? ` for ${args.env}` : ''}`,
    );

    let created = 0;
    let skipped = 0;
    let unchanged = 0;

    for (const brand of brands) {
      const ownerUserId = args.userId || brand.user?.toString();
      if (!ownerUserId || !Types.ObjectId.isValid(ownerUserId)) {
        logger.warn(
          `Skipping brand ${brand._id.toString()} (${brand.label}) because no valid owner userId is available`,
        );
        skipped += 1;
        continue;
      }

      const status = await defaultRecurringContentService.getStatus(
        brand.organization.toString(),
        brand._id.toString(),
      );

      const existingTypes = new Set(
        status.items.map((item) => item.contentType),
      );
      const missingTypes = ['post', 'newsletter', 'image'].filter(
        (contentType) => !existingTypes.has(contentType as never),
      );

      if (missingTypes.length === 0) {
        logger.log(
          `Unchanged brand ${brand._id.toString()} (${brand.label}) - bundle already configured`,
        );
        unchanged += 1;
        continue;
      }

      if (args.dryRun) {
        logger.log(
          `[DRY RUN] would seed ${missingTypes.join(', ')} workflows for brand ${brand._id.toString()} (${brand.label})`,
        );
        created += 1;
        continue;
      }

      await defaultRecurringContentService.ensureDefaultBundle({
        brandId: brand._id.toString(),
        organizationId: brand.organization.toString(),
        origin: 'system',
        userId: ownerUserId,
      });

      logger.log(
        `Seeded ${missingTypes.join(', ')} workflows for brand ${brand._id.toString()} (${brand.label})`,
      );
      created += 1;
    }

    logger.log(
      `Workflow seed summary: updated=${created}, unchanged=${unchanged}, skipped=${skipped}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  logger.error('Workflow seed failed', error);
  process.exit(1);
});
