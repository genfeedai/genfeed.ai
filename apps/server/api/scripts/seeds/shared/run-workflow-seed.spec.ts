/**
 * Verification for the shared workflow-seed harness (audit §7 risk table:
 * "Targeted dry-run execution for at least two migrated seeds. Snapshot or
 * assert CLI arg parsing, env loading, org filtering, and result summaries.")
 *
 * These exercise the pure harness surface only — no Nest application context is
 * booted (the Nest-touching dependencies are lazy-imported inside
 * `runWorkflowSeed`, which is intentionally not called here).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOrganizationWhere,
  buildSummaryLine,
  findMissingTemplateIds,
  iterateOrganizations,
  loadSeedEnv,
  parseSeedArgs,
  type WorkflowSeedDryRunContext,
  type WorkflowSeedTemplate,
} from './run-workflow-seed';

function createLogger(): Logger {
  return {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
}

const TEMPLATES: readonly WorkflowSeedTemplate[] = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
];

describe('parseSeedArgs', () => {
  it('defaults to dry-run with no env/organization filters', () => {
    expect(parseSeedArgs(['node', 'seed'])).toEqual({
      dryRun: true,
      env: undefined,
      organizationId: undefined,
    });
  });

  it('treats --live as the non-dry-run switch', () => {
    expect(parseSeedArgs(['node', 'seed', '--live']).dryRun).toBe(false);
  });

  it('parses --env and --organizationId values', () => {
    expect(
      parseSeedArgs([
        'node',
        'seed',
        '--live',
        '--env=production',
        '--organizationId=org_123',
      ]),
    ).toEqual({
      dryRun: false,
      env: 'production',
      organizationId: 'org_123',
    });
  });
});

describe('buildOrganizationWhere', () => {
  it('scopes to soft-deleted-only when no organization is given', () => {
    expect(buildOrganizationWhere({ dryRun: true })).toEqual({
      isDeleted: false,
    });
  });

  it('narrows to a single organization id when provided', () => {
    expect(
      buildOrganizationWhere({ dryRun: true, organizationId: 'org_9' }),
    ).toEqual({ id: 'org_9', isDeleted: false });
  });
});

describe('loadSeedEnv', () => {
  const createdKeys: string[] = [];

  afterEach(() => {
    for (const key of createdKeys.splice(0)) {
      delete process.env[key];
    }
    vi.restoreAllMocks();
  });

  it('loads and overrides values from an explicit --env file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seed-env-'));
    writeFileSync(
      join(dir, '.env.seedspec'),
      [
        '# comment line',
        'SEED_SPEC_KEY=from_file',
        'MALFORMED_NO_EQ',
        'SEED_SPEC_MULTI=a=b=c',
      ].join('\n'),
    );
    createdKeys.push('SEED_SPEC_KEY', 'SEED_SPEC_MULTI');
    process.env.SEED_SPEC_KEY = 'preexisting';

    const logger = createLogger();
    loadSeedEnv(['node', 'seed', '--env=seedspec'], dir, logger);

    // Explicit --env overrides preexisting values.
    expect(process.env.SEED_SPEC_KEY).toBe('from_file');
    // Only the first `=` splits key/value.
    expect(process.env.SEED_SPEC_MULTI).toBe('a=b=c');
    expect(logger.log).toHaveBeenCalledWith('Loaded env from .env.seedspec');

    rmSync(dir, { force: true, recursive: true });
  });

  it('only fills gaps (never overrides) for the default local env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seed-env-'));
    writeFileSync(
      join(dir, '.env.local'),
      ['SEED_GAP_PRESET=file_value', 'SEED_GAP_FRESH=file_value'].join('\n'),
    );
    createdKeys.push('SEED_GAP_PRESET', 'SEED_GAP_FRESH');
    process.env.SEED_GAP_PRESET = 'env_value';

    loadSeedEnv(['node', 'seed'], dir, createLogger());

    expect(process.env.SEED_GAP_PRESET).toBe('env_value'); // preserved
    expect(process.env.SEED_GAP_FRESH).toBe('file_value'); // filled

    rmSync(dir, { force: true, recursive: true });
  });

  it('is non-fatal when the env file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seed-env-'));
    const logger = createLogger();

    expect(() =>
      loadSeedEnv(['node', 'seed', '--env=missing'], dir, logger),
    ).not.toThrow();
    expect(logger.log).toHaveBeenCalledWith(
      'No .env.missing found, using process env / defaults',
    );

    rmSync(dir, { force: true, recursive: true });
  });
});

describe('findMissingTemplateIds', () => {
  it('returns only the template ids not already provisioned', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ metadata: { sourceTemplateId: 'b' } }]);
    const prisma = { workflow: { findMany } } as unknown as PrismaService;

    const missing = await findMissingTemplateIds(prisma, 'org_1', TEMPLATES);

    expect(missing).toEqual(['a', 'c']);
    expect(findMany).toHaveBeenCalledWith({
      select: { metadata: true },
      where: {
        isDeleted: false,
        organizationId: 'org_1',
        OR: [
          { metadata: { equals: 'a', path: ['sourceTemplateId'] } },
          { metadata: { equals: 'b', path: ['sourceTemplateId'] } },
          { metadata: { equals: 'c', path: ['sourceTemplateId'] } },
        ],
      },
    });
  });

  it('ignores rows whose metadata sourceTemplateId is not a string', async () => {
    const prisma = {
      workflow: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ metadata: null }, { metadata: {} }]),
      },
    } as unknown as PrismaService;

    expect(await findMissingTemplateIds(prisma, 'org_1', TEMPLATES)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('buildSummaryLine', () => {
  it('formats processed/skipped tallies', () => {
    expect(
      buildSummaryLine('Ad automation workflow seed', {
        processed: 3,
        skipped: 1,
      }),
    ).toBe('Ad automation workflow seed summary: processed=3, skipped=1');
  });
});

describe('iterateOrganizations', () => {
  it('dry-run: reports missing templates and never calls ensure', async () => {
    const findMany = vi.fn().mockResolvedValue([]); // nothing provisioned yet
    const prisma = { workflow: { findMany } } as unknown as PrismaService;
    const logger = createLogger();
    const ensure = vi.fn();

    const result = await iterateOrganizations({
      dryRun: true,
      dryRunLabel: 'ad automation',
      ensure,
      logger,
      organizations: [
        { id: 'org_1', userId: 'user_1' },
        { id: 'org_2', userId: null },
      ],
      prisma,
      templates: TEMPLATES,
    });

    expect(ensure).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, skipped: 1 });
    expect(logger.warn).toHaveBeenCalledWith(
      'Skipping organization org_2 - no owner userId',
    );
    expect(logger.log).toHaveBeenCalledWith(
      '[DRY RUN] org org_1 missing 3/3 ad automation workflow(s): a, b, c',
    );
  });

  it('dry-run: delegates to a custom reporter when supplied', async () => {
    const findMany = vi.fn();
    const prisma = { workflow: { findMany } } as unknown as PrismaService;
    const logger = createLogger();
    const reportDryRun = vi.fn(async (context: WorkflowSeedDryRunContext) => {
      context.logger.log(`custom:${context.organizationId}`);
    });

    const result = await iterateOrganizations({
      dryRun: true,
      dryRunLabel: 'content production',
      ensure: vi.fn(),
      logger,
      organizations: [{ id: 'org_1', userId: 'user_1' }],
      prisma,
      reportDryRun,
      templates: TEMPLATES,
    });

    expect(reportDryRun).toHaveBeenCalledTimes(1);
    expect(reportDryRun.mock.calls[0]?.[0]?.organizationId).toBe('org_1');
    expect(findMany).not.toHaveBeenCalled(); // default reporter bypassed
    expect(logger.log).toHaveBeenCalledWith('custom:org_1');
    expect(result).toEqual({ processed: 1, skipped: 0 });
  });

  it('live: calls ensure per eligible org and skips owner-less orgs', async () => {
    const prisma = {
      workflow: { findMany: vi.fn() },
    } as unknown as PrismaService;
    const ensure = vi.fn().mockResolvedValue(undefined);

    const result = await iterateOrganizations({
      dryRun: false,
      dryRunLabel: 'ad automation',
      ensure,
      logger: createLogger(),
      organizations: [
        { id: 'org_1', userId: 'user_1' },
        { id: 'org_2', userId: null },
        { id: 'org_3', userId: 'user_3' },
      ],
      prisma,
      templates: TEMPLATES,
    });

    expect(ensure).toHaveBeenCalledTimes(2);
    expect(ensure).toHaveBeenNthCalledWith(1, 'user_1', 'org_1');
    expect(ensure).toHaveBeenNthCalledWith(2, 'user_3', 'org_3');
    expect(prisma.workflow.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 2, skipped: 1 });
  });
});
