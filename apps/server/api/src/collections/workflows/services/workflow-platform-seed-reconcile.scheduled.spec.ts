import {
  reconcilePlatformSeedMarker,
  reconcileSeededWorkflowBeforeScheduledRun,
} from '@api/collections/workflows/services/workflow-platform-seed-reconcile.util';
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

function createDeps() {
  const prisma = {
    member: { findFirst: vi.fn() },
    workflow: { findMany: vi.fn(), updateMany: vi.fn() },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  return {
    deps: { logger: logger as never, prisma: prisma as never },
    logger,
    prisma,
  };
}

describe('reconcilePlatformSeedMarker scoped to one row', () => {
  const input = {
    organizationId: 'org-1',
    template,
    userId: 'seed-user',
  };
  const { deps, logger, prisma } = createDeps();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.workflow.updateMany.mockResolvedValue({ count: 1 });
  });

  it('marks the named row when it is the oldest eligible one', async () => {
    prisma.workflow.findMany.mockResolvedValue([
      row({ id: 'wf-old' }),
      row({ id: 'wf-dup' }),
    ]);

    await expect(
      reconcilePlatformSeedMarker(deps, { ...input, onlyWorkflowId: 'wf-old' }),
    ).resolves.toBe('marked');
  });

  it('leaves a newer duplicate unmarked and never marks the older row on its behalf', async () => {
    prisma.workflow.findMany.mockResolvedValue([
      row({ id: 'wf-old' }),
      row({ id: 'wf-dup' }),
    ]);

    await expect(
      reconcilePlatformSeedMarker(deps, { ...input, onlyWorkflowId: 'wf-dup' }),
    ).resolves.toBe('no-canonical-row');
    expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
  });

  it('stays quiet for a row it does not mark', async () => {
    prisma.workflow.findMany.mockResolvedValue([
      row({ currentVersion: { contentHash: 'sha256:v1:edited' } }),
    ]);

    await reconcilePlatformSeedMarker(deps, {
      ...input,
      onlyWorkflowId: 'wf-1',
    });

    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('reconcileSeededWorkflowBeforeScheduledRun', () => {
  const { deps, logger, prisma } = createDeps();
  const ownerActor = {
    isApiKey: false,
    organizationId: 'org-1',
    scopes: [],
    userId: 'seed-user',
  };

  function scheduled(overrides: Record<string, unknown> = {}) {
    return {
      brandId: null,
      currentVersion: { contentHash: canonicalHash },
      id: 'wf-1',
      metadata: {
        sourceTemplateId: template.id,
        sourceType: 'seeded-template',
      },
      organizationId: 'org-1',
      platformSeedKey: null,
      scheduleInitiatingActor: null,
      templateInstantiationKey: null,
      userId: 'seed-user',
      ...overrides,
    } as Parameters<typeof reconcileSeededWorkflowBeforeScheduledRun>[1];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.member.findFirst.mockResolvedValue({ userId: 'seed-user' });
    prisma.workflow.findMany.mockResolvedValue([row()]);
    prisma.workflow.updateMany.mockResolvedValue({ count: 1 });
  });

  it('marks an unmarked canonical row owned by the active organization owner', async () => {
    await expect(
      reconcileSeededWorkflowBeforeScheduledRun(deps, scheduled()),
    ).resolves.toBe(template.id);

    // The owner is proven from the organization, never from the row.
    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      select: { userId: true },
      where: {
        isActive: true,
        isDeleted: false,
        organization: { isDeleted: false, userId: 'seed-user' },
        organizationId: 'org-1',
        userId: 'seed-user',
      },
    });
    expect(prisma.workflow.updateMany).toHaveBeenCalledWith({
      data: {
        platformSeedKey: template.id,
        scheduleInitiatingActor: Prisma.DbNull,
      },
      where: expect.objectContaining({ id: 'wf-1', platformSeedKey: null }),
    });
  });

  it('never sets or touches the schedule switch, so a paused row cannot be re-enabled', async () => {
    await reconcileSeededWorkflowBeforeScheduledRun(deps, scheduled());

    const [args] = prisma.workflow.updateMany.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(Object.keys(args.data).sort()).toEqual([
      'platformSeedKey',
      'scheduleInitiatingActor',
    ]);
  });

  it('replaces the owner actor the grandfather migration bound with the platform marker', async () => {
    await expect(
      reconcileSeededWorkflowBeforeScheduledRun(
        deps,
        scheduled({ scheduleInitiatingActor: ownerActor }),
      ),
    ).resolves.toBe(template.id);
  });

  it('never reads or writes for a row that is not provably the seeded canonical one', async () => {
    const cases: Array<Record<string, unknown>> = [
      { platformSeedKey: template.id },
      { brandId: 'brand-1' },
      { currentVersion: { contentHash: 'sha256:v1:edited' } },
      { currentVersion: null },
      { metadata: { sourceTemplateId: template.id } },
      {
        metadata: {
          sourceTemplateId: 'forged-template',
          sourceType: 'seeded-template',
        },
      },
      {
        metadata: {
          createdFrom: 'templates',
          sourceTemplateId: template.id,
          sourceType: 'seeded-template',
        },
      },
      { templateInstantiationKey: 'attempt-1' },
      // Another member's or an API key's explicit schedule choice stays theirs.
      { scheduleInitiatingActor: { ...ownerActor, userId: 'member-2' } },
      {
        scheduleInitiatingActor: {
          ...ownerActor,
          apiKeyId: 'key-1',
          isApiKey: true,
        },
      },
    ];

    for (const overrides of cases) {
      await expect(
        reconcileSeededWorkflowBeforeScheduledRun(deps, scheduled(overrides)),
      ).resolves.toBeNull();
    }
    expect(prisma.member.findFirst).not.toHaveBeenCalled();
    expect(prisma.workflow.findMany).not.toHaveBeenCalled();
    expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
  });

  it('does not mark a row owned by a member who is not the organization owner', async () => {
    prisma.member.findFirst.mockResolvedValue(null);

    await expect(
      reconcileSeededWorkflowBeforeScheduledRun(
        deps,
        scheduled({ userId: 'member-2' }),
      ),
    ).resolves.toBeNull();
    expect(prisma.workflow.findMany).not.toHaveBeenCalled();
    expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
  });

  it('does not mark a manual-run template', async () => {
    const manual = CONTENT_LEARNING_WORKFLOW_TEMPLATES.find(
      (candidate) => !isPlatformScheduledTemplate(candidate),
    ) as typeof template;

    await expect(
      reconcileSeededWorkflowBeforeScheduledRun(
        deps,
        scheduled({
          currentVersion: { contentHash: getPlatformSeedContentHash(manual) },
          metadata: {
            sourceTemplateId: manual.id,
            sourceType: 'seeded-template',
          },
        }),
      ),
    ).resolves.toBeNull();
    expect(prisma.workflow.updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op when it loses the compare-and-set to a concurrent edit', async () => {
    prisma.workflow.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      reconcileSeededWorkflowBeforeScheduledRun(deps, scheduled()),
    ).resolves.toBeNull();
  });

  it('is a no-op when a concurrent reconcile marked a row first', async () => {
    prisma.workflow.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        clientVersion: 'test',
        code: 'P2002',
      }),
    );

    await expect(
      reconcileSeededWorkflowBeforeScheduledRun(deps, scheduled()),
    ).resolves.toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps the existing authority rules when the database fails', async () => {
    prisma.workflow.findMany.mockRejectedValue(new Error('connection lost'));

    await expect(
      reconcileSeededWorkflowBeforeScheduledRun(deps, scheduled()),
    ).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not reconcile'),
      expect.objectContaining({ workflowId: 'wf-1' }),
    );
  });
});
