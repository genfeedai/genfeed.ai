/**
 * Shared harness for workflow seed scripts.
 *
 * Every `*-workflows.seed.ts` script under `scripts/seeds/` repeats the same
 * CLI/env/bootstrap/org-iteration/reporting shell and differs only in which
 * template set + `ensure*Workflows` method it drives. This module centralizes
 * that shell so the per-workflow `ensure*` functions can stay where they live
 * (the `WorkflowTemplateSeederService`).
 *
 * This is deliberately NOT a workflow-definition DSL — the duplication being
 * removed is script harness boilerplate, not workflow business rules.
 *
 * The Nest-touching dependencies (`AppModule`, `NestFactory`, `PrismaService`,
 * `WorkflowTemplateSeederService`) are imported lazily inside `runWorkflowSeed`
 * so the pure helpers (`parseSeedArgs`, `loadSeedEnv`, `buildOrganizationWhere`,
 * `findMissingTemplateIds`, `buildSummaryLine`, `iterateOrganizations`) can be
 * imported and unit-tested without booting the application graph.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { WorkflowTemplateSeederService } from '@api/collections/workflows/services/workflow-template-seeder.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Logger } from '@nestjs/common';

/** Minimal template shape the harness relies on (templates carry much more). */
export type WorkflowSeedTemplate = {
  id: string;
};

export type SeedArgs = {
  dryRun: boolean;
  env?: string;
  organizationId?: string;
};

/** Context handed to a custom dry-run reporter. */
export type WorkflowSeedDryRunContext = {
  logger: Logger;
  organizationId: string;
  prisma: PrismaService;
  templates: readonly WorkflowSeedTemplate[];
};

export type WorkflowSeedConfig = {
  /**
   * Human-readable seed name used in the summary + failure lines, e.g.
   * `Ad automation workflow seed` → `... summary: ...` / `... failed`.
   */
  name: string;
  /**
   * Lowercase family label used in the default dry-run line, e.g.
   * `ad automation` → `missing N/M ad automation workflow(s): ...`.
   */
  dryRunLabel: string;
  /** NestJS `Logger` context name. */
  loggerName: string;
  /** Template set this seed provisions. */
  templates: readonly WorkflowSeedTemplate[];
  /** The `ensure*Workflows` method for this seed (kept in the service). */
  ensure: (
    seeder: WorkflowTemplateSeederService,
    userId: string,
    organizationId: string,
  ) => Promise<void>;
  /**
   * Optional custom dry-run reporter. When omitted the harness logs the
   * standard `missing N/M <label> workflow(s)` line. Supply this only when a
   * seed reports extra state (e.g. content-production mirrors schedules).
   */
  reportDryRun?: (context: WorkflowSeedDryRunContext) => Promise<void>;
};

/**
 * Parses seed CLI args. Dry-run is the default; `--live` applies changes.
 */
export function parseSeedArgs(argv: string[]): SeedArgs {
  const args = argv.slice(2);
  return {
    dryRun: !args.includes('--live'),
    env: args.find((arg) => arg.startsWith('--env='))?.split('=')[1],
    organizationId: args
      .find((arg) => arg.startsWith('--organizationId='))
      ?.split('=')[1],
  };
}

/**
 * Loads `<envBaseDir>/.env.<suffix>` into `process.env`. When `--env=` is
 * passed the file values override existing env; otherwise they only fill gaps.
 * Missing files are non-fatal.
 */
export function loadSeedEnv(
  argv: string[],
  envBaseDir: string,
  logger: Logger,
): void {
  const args = argv.slice(2);
  const envArg = args.find((arg) => arg.startsWith('--env='))?.split('=')[1];
  const envSuffix = envArg || 'local';
  const envPath = resolve(envBaseDir, `.env.${envSuffix}`);

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

/**
 * Builds the organization `where` filter. Always soft-delete scoped; narrows to
 * a single organization when `--organizationId=` is passed.
 */
export function buildOrganizationWhere(
  args: SeedArgs,
): Record<string, unknown> {
  const where: Record<string, unknown> = { isDeleted: false };
  if (args.organizationId) {
    where.id = args.organizationId;
  }
  return where;
}

/**
 * Returns the template ids that are not yet provisioned as workflows for an
 * organization, matched via `metadata.sourceTemplateId`.
 */
export async function findMissingTemplateIds(
  prisma: PrismaService,
  organizationId: string,
  templates: readonly WorkflowSeedTemplate[],
): Promise<string[]> {
  const existing = await prisma.workflow.findMany({
    select: { metadata: true },
    where: {
      isDeleted: false,
      organizationId,
      OR: templates.map((template) => ({
        metadata: {
          equals: template.id,
          path: ['sourceTemplateId'],
        },
      })),
    },
  });
  const existingTemplateIds = new Set(
    existing
      .map((workflow) => {
        const metadata = workflow.metadata as Record<string, unknown> | null;
        return typeof metadata?.sourceTemplateId === 'string'
          ? metadata.sourceTemplateId
          : null;
      })
      .filter((value): value is string => Boolean(value)),
  );
  return templates
    .filter((template) => !existingTemplateIds.has(template.id))
    .map((template) => template.id);
}

/** Formats the end-of-run summary line. */
export function buildSummaryLine(
  name: string,
  result: { processed: number; skipped: number },
): string {
  return `${name} summary: processed=${result.processed}, skipped=${result.skipped}`;
}

async function reportDefaultDryRun(
  context: WorkflowSeedDryRunContext,
  dryRunLabel: string,
): Promise<void> {
  const missing = await findMissingTemplateIds(
    context.prisma,
    context.organizationId,
    context.templates,
  );
  context.logger.log(
    `[DRY RUN] org ${context.organizationId} missing ${missing.length}/${context.templates.length} ${dryRunLabel} workflow(s): ${missing.join(', ') || 'none'}`,
  );
}

/**
 * Iterates organizations, applying dry-run reporting or the live `ensure`
 * call. Organizations without an owner `userId` are skipped. Returns the
 * processed/skipped tallies for the summary line.
 */
export async function iterateOrganizations(params: {
  organizations: readonly { id: string; userId: string | null }[];
  dryRun: boolean;
  dryRunLabel: string;
  logger: Logger;
  prisma: PrismaService;
  templates: readonly WorkflowSeedTemplate[];
  ensure: (userId: string, organizationId: string) => Promise<void>;
  reportDryRun?: (context: WorkflowSeedDryRunContext) => Promise<void>;
}): Promise<{ processed: number; skipped: number }> {
  let processed = 0;
  let skipped = 0;

  for (const organization of params.organizations) {
    if (!organization.userId) {
      params.logger.warn(
        `Skipping organization ${organization.id} - no owner userId`,
      );
      skipped += 1;
      continue;
    }

    if (params.dryRun) {
      const context: WorkflowSeedDryRunContext = {
        logger: params.logger,
        organizationId: organization.id,
        prisma: params.prisma,
        templates: params.templates,
      };
      if (params.reportDryRun) {
        await params.reportDryRun(context);
      } else {
        await reportDefaultDryRun(context, params.dryRunLabel);
      }
      processed += 1;
      continue;
    }

    await params.ensure(organization.userId, organization.id);
    processed += 1;
  }

  return { processed, skipped };
}

const sharedDir = fileURLToPath(new URL('.', import.meta.url));
// scripts/seeds/shared -> apps/server/api (where the .env.* files live).
const apiRootDir = resolve(sharedDir, '..', '..', '..');

/**
 * Runs a workflow seed end-to-end: loads env, parses args, boots the Nest
 * application context, iterates organizations, and prints the summary. On
 * failure it logs and exits non-zero, matching the previous per-script shell.
 */
export async function runWorkflowSeed(
  config: WorkflowSeedConfig,
): Promise<void> {
  const logger = new Logger(config.loggerName);

  try {
    loadSeedEnv(process.argv, apiRootDir, logger);
    const args = parseSeedArgs(process.argv);

    // Lazy imports keep the Nest application graph out of the module load path,
    // so the pure helpers above stay unit-testable without booting the app.
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('@api/app.module');
    const { WorkflowTemplateSeederService } = await import(
      '@api/collections/workflows/services/workflow-template-seeder.service'
    );
    const { PrismaService } = await import(
      '@api/shared/modules/prisma/prisma.service'
    );

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'log', 'warn'],
    });

    try {
      const workflowSeeder = app.get(WorkflowTemplateSeederService);
      const prisma = app.get(PrismaService);

      const organizations = await prisma.organization.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, userId: true },
        where: buildOrganizationWhere(args) as never,
      });

      logger.log(
        `${args.dryRun ? 'DRY RUN' : 'LIVE'} evaluating ${organizations.length} organization(s)${args.env ? ` for ${args.env}` : ''}`,
      );

      const result = await iterateOrganizations({
        dryRun: args.dryRun,
        dryRunLabel: config.dryRunLabel,
        ensure: (userId, organizationId) =>
          config.ensure(workflowSeeder, userId, organizationId),
        logger,
        organizations,
        prisma,
        reportDryRun: config.reportDryRun,
        templates: config.templates,
      });

      logger.log(buildSummaryLine(config.name, result));
    } finally {
      await app.close();
    }
  } catch (error) {
    logger.error(`${config.name} failed`, error);
    process.exit(1);
  }
}
