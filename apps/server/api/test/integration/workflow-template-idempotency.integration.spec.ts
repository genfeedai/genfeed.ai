import { randomUUID } from 'node:crypto';
import type { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** Explicit disposable database only; never executes paid templates. */
describe('Seeded template idempotency (real PostgreSQL, #5560)', () => {
  let prisma: PrismaClient;
  let service: WorkflowsService;
  const user = `5560-user-${randomUUID()}`;
  const otherUser = `5560-user-${randomUUID()}`;
  const org = `5560-org-${randomUUID()}`;
  const otherOrg = `5560-org-${randomUUID()}`;
  const brand = `5560-brand-${randomUUID()}`;
  const otherBrand = `5560-brand-${randomUUID()}`;
  const syncWorkflowScheduler = vi.fn();
  const request = (
    idempotencyKey: string,
    overrides: Partial<CreateWorkflowDto> = {},
  ): CreateWorkflowDto => ({
    idempotencyKey,
    label: 'First write',
    templateId: 'release-loop',
    ...overrides,
  });
  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    const database = url ? new URL(url) : null;
    const isDisposableStudioDatabase = database?.pathname.startsWith(
      '/genfeed_5560_disposable',
    );
    const isDisposableCiDatabase =
      process.env.CI === 'true' &&
      database?.pathname === '/test' &&
      ['localhost', '127.0.0.1'].includes(database.hostname);
    if (!url || (!isDisposableStudioDatabase && !isDisposableCiDatabase)) {
      throw new Error(
        'Requires DATABASE_URL for genfeed_5560_disposable on Studio',
      );
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    await prisma.user.createMany({
      data: [
        { id: user, handle: user },
        { id: otherUser, handle: otherUser },
      ],
    });
    await prisma.organization.createMany({
      data: [org, otherOrg].map((id) => ({
        id,
        userId: user,
        label: id,
        slug: id,
      })),
    });
    await prisma.brand.createMany({
      data: [brand, otherBrand].map((id) => ({
        id,
        organizationId: org,
        userId: user,
        label: id,
        slug: id,
      })),
    });
    service = new WorkflowsService(
      prisma as never,
      { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never,
      {
        get: (token: unknown) =>
          token === WorkflowExecutionQueueService
            ? { syncWorkflowScheduler }
            : undefined,
      } as never,
    );
    vi.spyOn(service, 'executeWorkflow').mockResolvedValue({ mode: 'node' });
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('concurrent requests commit exactly one identity and first version, with one scheduler/execution', async () => {
    syncWorkflowScheduler.mockClear();
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        service.createWorkflow(
          user,
          org,
          request(key, {
            trigger: 'manual' as never,
            inputVariables: [
              {
                key: 'fixture',
                label: 'Fixture',
                type: 'text',
                required: true,
                defaultValue: 'test-only',
              },
            ],
          }),
          brand,
        ),
      ),
    );
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(
      await prisma.workflow.count({
        where: {
          organizationId: org,
          userId: user,
          templateInstantiationKey: key,
          isDeleted: false,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.workflowVersion.count({
        where: {
          organizationId: org,
          workflowId: results[0].id,
        },
      }),
    ).toBe(1);
    expect(syncWorkflowScheduler).toHaveBeenCalledTimes(1);
    expect(service.executeWorkflow).toHaveBeenCalledTimes(1);
  });

  it('sequential and lost-response replays return current edits, with mutable first-write-wins', async () => {
    const key = randomUUID();
    const created = await service.createWorkflow(
      user,
      org,
      request(key),
      brand,
    );
    await service.patch(created.id, {
      label: 'Later edit',
      nodes: [],
      edges: [],
    });
    const replay = await service.createWorkflow(
      user,
      org,
      request(key, { label: 'Retry label', schedule: '0 12 * * *' }),
      brand,
    );
    expect(replay.id).toBe(created.id);
    expect(replay.label).toBe('Later edit');
    expect(replay.version).toBe(2);
    expect(replay.schedule).toBe('0 9 * * *');
    expect(
      await prisma.workflowVersion.count({
        where: {
          workflowId: created.id,
          organizationId: org,
        },
      }),
    ).toBe(2);
  });

  it('separates users, organizations, explicit attempts and unkeyed creates', async () => {
    const key = randomUUID();
    const results = await Promise.all([
      service.createWorkflow(user, org, request(key)),
      service.createWorkflow(otherUser, org, request(key)),
      service.createWorkflow(user, otherOrg, request(key)),
      service.createWorkflow(user, org, request(randomUUID())),
      service.createWorkflow(
        user,
        org,
        request(key, { idempotencyKey: undefined }),
      ),
      service.createWorkflow(
        user,
        org,
        request(key, { idempotencyKey: undefined }),
      ),
    ]);
    expect(new Set(results.map((row) => row.id)).size).toBe(6);
  });

  it('reserves deleted identities and rejects changed template/brand bindings', async () => {
    const key = randomUUID();
    const created = await service.createWorkflow(
      user,
      org,
      request(key),
      brand,
    );
    await expect(
      service.createWorkflow(user, org, request(key), otherBrand),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.createWorkflow(
        user,
        org,
        request(key, { templateId: 'content-loop' }),
        brand,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await prisma.workflow.update({
      where: { id: created.id },
      data: { isDeleted: true },
    });
    await expect(
      service.createWorkflow(user, org, request(key), brand),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await service.createWorkflow(user, org, request(randomUUID()), brand))
        .id,
    ).not.toBe(created.id);
  });

  it('rolls back identity and version together when first-version insertion fails', async () => {
    const key = randomUUID();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_5560_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS (SELECT 1 FROM workflows WHERE id = NEW."workflowId" AND label = 'rollback-5560') THEN
        RAISE EXCEPTION '5560 injected first-version failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER reject_5560_version BEFORE INSERT ON workflow_versions FOR EACH ROW EXECUTE FUNCTION reject_5560_version()',
    );
    try {
      await expect(
        service.createWorkflow(
          user,
          org,
          request(key, { label: 'rollback-5560' }),
          brand,
        ),
      ).rejects.toThrow();
      expect(
        await prisma.workflow.count({
          where: {
            organizationId: org,
            userId: user,
            templateInstantiationKey: key,
          },
        }),
      ).toBe(0);
      expect(
        await prisma.workflowVersion.count({
          where: {
            organizationId: org,
            workflow: { templateInstantiationKey: key },
          },
        }),
      ).toBe(0);
      expect(
        await service.createWorkflow(user, org, request(key), brand),
      ).toHaveProperty('id');
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER reject_5560_version ON workflow_versions',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_5560_version()');
    }
  });
});
