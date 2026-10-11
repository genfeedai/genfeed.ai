import { reconcilePlatformSeedMarker } from '@api/collections/workflows/services/workflow-platform-seed-reconcile.util';
import { ANALYTICS_SYNC_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { CONTENT_LEARNING_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-learning-workflows.template';
import {
  getPlatformSeedContentHash,
  isPlatformScheduledTemplate,
} from '@api/collections/workflows/utils/workflow-platform-seed.util';
import { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const template = ANALYTICS_SYNC_WORKFLOW_TEMPLATES[0];
const canonicalHash = getPlatformSeedContentHash(template) as string;
const updatedAt = new Date('2026-10-01T00:00:00Z');
const input = { organizationId: 'org-1', template, userId: 'seed-user' };

function row(overrides: Record<string, unknown> = {}) {
  return {
    brandId: null,
    currentVersion: { contentHash: canonicalHash },
    currentVersionId: 'version-1',
    id: 'wf-1',
    isScheduleEnabled: true,
    metadata: { sourceTemplateId: template.id, sourceType: 'seeded-template' },
    platformSeedKey: null,
    templateInstantiationKey: null,
    updatedAt,
    userId: 'seed-user',
    ...overrides,
  };
}

describe('reconcilePlatformSeedMarker', () => {
  const prisma = {
    workflow: { findMany: vi.fn(), updateMany: vi.fn() },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const deps = { logger: logger as never, prisma: prisma as never };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.workflow.findMany.mockResolvedValue([]);
    prisma.workflow.updateMany.mockResolvedValue({ count: 1 });
  });

  it('marks the seeder row that matches the template, the user and the graph', async () => {
    prisma.workflow.findMany.mockResolvedValue([row()]);

    await expect(reconcilePlatformSeedMarker(deps, input)).resolves.toBe(
      'marked',
    );

    expect(prisma.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          metadata: { equals: template.id, path: ['sourceTemplateId'] },
          organizationId: 'org-1',
        }),
      }),
    );
    // Compare-and-set on the version it validated, unmarked only, and the actor dropped.
    expect(prisma.workflow.updateMany).toHaveBeenCalledWith({
      data: {
        platformSeedKey: template.id,
        scheduleInitiatingActor: Prisma.DbNull,
      },
      where: {
        currentVersionId: 'version-1',
        id: 'wf-1',
        isDeleted: false,
        organizationId: 'org-1',
        platformSeedKey: null,
        templateInstantiationKey: null,
        updatedAt,
        userId: 'seed-user',
      },
    });
  });

  it('does not mark a tenant row that forges the seeded metadata but not the graph', async () => {
    prisma.workflow.findMany.mockResolvedValue([
      row({ currentVersion: { contentHash: 'sha256:v1:forged' } }),
    ]);

    await expect(reconcilePlatformSeedMarker(deps, input)).resolves.toBe(
      'no-canonical-row',
    );

    expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('does not match its canonical template'),
      expect.objectContaining({ workflowIds: ['wf-1'] }),
    );
  });

  it.each([
    ['another user', { userId: 'someone-else' }],
    ['a brand', { brandId: 'brand-1' }],
    [
      'forged non-seeded provenance',
      { metadata: { sourceTemplateId: template.id } },
    ],
    ['a marker for another template', { platformSeedKey: 'other-template' }],
    [
      'a tenant template install (instantiation key)',
      { templateInstantiationKey: 'attempt-1' },
    ],
    [
      'a tenant install origin',
      {
        metadata: {
          createdFrom: 'agent',
          sourceTemplateId: template.id,
          sourceType: 'seeded-template',
        },
      },
    ],
  ])('does not mark a row owned by %s', async (_name, overrides) => {
    prisma.workflow.findMany.mockResolvedValue([row(overrides)]);

    await expect(reconcilePlatformSeedMarker(deps, input)).resolves.toBe(
      'no-canonical-row',
    );
    expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
  });

  it('marks the oldest matching row and leaves a later tenant duplicate alone', async () => {
    prisma.workflow.findMany.mockResolvedValue([
      row({ currentVersionId: 'version-old', id: 'wf-old' }),
      row({ currentVersionId: 'version-dup', id: 'wf-dup' }),
    ]);

    await reconcilePlatformSeedMarker(deps, input);

    expect(prisma.workflow.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.workflow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'wf-old' }),
      }),
    );
  });

  it('is idempotent once a row carries the marker', async () => {
    prisma.workflow.findMany.mockResolvedValue([
      row({ id: 'wf-marked', platformSeedKey: template.id }),
      row({ id: 'wf-dup' }),
    ]);

    await expect(reconcilePlatformSeedMarker(deps, input)).resolves.toBe(
      'already-marked',
    );
    expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
  });

  it('never re-enables a paused row, because a user pause cannot be told from a hold', async () => {
    prisma.workflow.findMany.mockResolvedValue([
      row({ isScheduleEnabled: false }),
    ]);

    await expect(reconcilePlatformSeedMarker(deps, input)).resolves.toBe(
      'marked',
    );

    const [args] = prisma.workflow.updateMany.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(args.data).not.toHaveProperty('isScheduleEnabled');
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('left paused'),
      expect.objectContaining({ workflowId: 'wf-1' }),
    );
  });

  it('treats a lost compare-and-set as no canonical row', async () => {
    prisma.workflow.findMany.mockResolvedValue([row()]);
    prisma.workflow.updateMany.mockResolvedValue({ count: 0 });

    await expect(reconcilePlatformSeedMarker(deps, input)).resolves.toBe(
      'no-canonical-row',
    );
  });

  it('treats a unique violation from a concurrent reconcile as already marked', async () => {
    prisma.workflow.findMany.mockResolvedValue([row()]);
    prisma.workflow.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        clientVersion: 'test',
        code: 'P2002',
      }),
    );

    await expect(reconcilePlatformSeedMarker(deps, input)).resolves.toBe(
      'already-marked',
    );
  });

  it('rethrows any other database failure', async () => {
    prisma.workflow.findMany.mockResolvedValue([row()]);
    prisma.workflow.updateMany.mockRejectedValue(new Error('connection lost'));

    await expect(reconcilePlatformSeedMarker(deps, input)).rejects.toThrow(
      'connection lost',
    );
  });

  it('skips templates that ship no canonical cron without reading rows', async () => {
    const manual = CONTENT_LEARNING_WORKFLOW_TEMPLATES.find(
      (candidate) => !isPlatformScheduledTemplate(candidate),
    );

    await expect(
      reconcilePlatformSeedMarker(deps, {
        ...input,
        template: manual as typeof template,
      }),
    ).resolves.toBe('not-scheduled');
    expect(prisma.workflow.findMany).not.toHaveBeenCalled();
  });
});
