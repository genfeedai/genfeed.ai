import { randomUUID } from 'node:crypto';
import {
  reconcilePlatformSeedMarker,
  reconcileSeededWorkflowBeforeScheduledRun,
} from '@api/collections/workflows/services/workflow-platform-seed-reconcile.util';
import { ANALYTICS_SYNC_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { getPlatformSeedContentHash } from '@api/collections/workflows/utils/workflow-platform-seed.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: CI provisions this fully migrated, disposable database for the
// *.postgres.spec.ts suites. Never DATABASE_URL, never a shared server.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/test/i.test(url.pathname)
  ) {
    throw new Error(
      'Platform seed reconcile proof needs a disposable local database',
    );
  }
}

const template = ANALYTICS_SYNC_WORKFLOW_TEMPLATES[0];
const canonicalHash = getPlatformSeedContentHash(template) as string;

describe.skipIf(!connectionString)(
  'platform seed reconcile against a fully migrated PostgreSQL (#6689)',
  () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: connectionString ?? '' }),
    });
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const deps = {
      logger: logger as never,
      prisma: prisma as unknown as PrismaService,
    };
    let ownerRoleId: string;

    beforeAll(async () => {
      const role = await prisma.role.upsert({
        create: { key: MemberRole.OWNER, label: 'Owner' },
        update: {},
        where: { key: MemberRole.OWNER },
      });
      ownerRoleId = role.id;
    });
    beforeEach(() => {
      vi.clearAllMocks();
    });
    afterAll(async () => {
      await prisma.$disconnect();
    });

    async function seedOrganization() {
      const suffix = randomUUID();
      const owner = `owner-${suffix}`;
      const member = `member-${suffix}`;
      const organizationId = `org-${suffix}`;
      for (const id of [owner, member]) {
        await prisma.user.create({ data: { handle: id, id } });
      }
      await prisma.organization.create({
        data: {
          id: organizationId,
          label: organizationId,
          slug: organizationId,
          userId: owner,
        },
      });
      // Every member row requires a current brand of its own organization.
      const homeBrand = `home-${suffix}`;
      await prisma.brand.create({
        data: {
          id: homeBrand,
          label: homeBrand,
          organizationId,
          slug: homeBrand,
          userId: owner,
        },
      });
      for (const userId of [owner, member]) {
        await prisma.member.create({
          data: {
            currentBrandId: homeBrand,
            organizationId,
            roleId: ownerRoleId,
            roleKey: MemberRole.OWNER,
            userId,
          },
        });
      }
      return { member, organizationId, owner, suffix };
    }

    async function insertWorkflow(input: {
      brandId?: string;
      contentHash?: string;
      createdAt?: Date;
      isScheduleEnabled?: boolean;
      metadata?: Prisma.InputJsonObject;
      organizationId: string;
      scheduleInitiatingActor?: Prisma.InputJsonObject;
      templateInstantiationKey?: string;
      userId: string;
    }): Promise<string> {
      const id = `wf-${randomUUID()}`;
      const version = `version-${id}`;
      // The current-version foreign key is deferred, so the workflow goes first.
      await prisma.$transaction(async (tx) => {
        await tx.workflow.create({
          data: {
            brandId: input.brandId,
            createdAt: input.createdAt,
            currentVersionId: version,
            id,
            isScheduleEnabled: input.isScheduleEnabled ?? true,
            label: template.name,
            metadata: input.metadata ?? {
              sourceTemplateId: template.id,
              sourceType: 'seeded-template',
            },
            organizationId: input.organizationId,
            schedule: template.schedule,
            scheduleInitiatingActor: input.scheduleInitiatingActor,
            status: 'active',
            templateInstantiationKey: input.templateInstantiationKey,
            timezone: 'UTC',
            userId: input.userId,
          },
        });
        await tx.workflowVersion.create({
          data: {
            contentHash: input.contentHash ?? canonicalHash,
            graph: { edges: [], lockedNodeIds: [], nodes: [] },
            id: version,
            organizationId: input.organizationId,
            userId: input.userId,
            version: 1,
            workflowId: id,
          },
        });
      });
      return id;
    }

    async function load(id: string) {
      return prisma.workflow.findUniqueOrThrow({ where: { id } });
    }

    async function asScheduled(id: string) {
      const row = await prisma.workflow.findUniqueOrThrow({
        include: { currentVersion: { select: { contentHash: true } } },
        where: { id },
      });
      return row;
    }

    it('marks a canonical seeded row owned by the organization owner and runs no operator step', async () => {
      const org = await seedOrganization();
      const id = await insertWorkflow({
        organizationId: org.organizationId,
        scheduleInitiatingActor: {
          isApiKey: false,
          organizationId: org.organizationId,
          scopes: [],
          userId: org.owner,
        },
        userId: org.owner,
      });

      await expect(
        reconcileSeededWorkflowBeforeScheduledRun(deps, await asScheduled(id)),
      ).resolves.toEqual({ platformSeedKey: template.id, status: 'marked' });

      const row = await load(id);
      expect(row.platformSeedKey).toBe(template.id);
      expect(row.scheduleInitiatingActor).toBeNull();
      expect(row.isScheduleEnabled).toBe(true);
    });

    it('leaves edited, forged, brand-scoped, tenant-installed and non-owner rows alone', async () => {
      const org = await seedOrganization();
      const brandId = `brand-${org.suffix}`;
      await prisma.brand.create({
        data: {
          id: brandId,
          label: brandId,
          organizationId: org.organizationId,
          slug: brandId,
          userId: org.owner,
        },
      });
      const untouched = {
        edited: await insertWorkflow({
          contentHash: 'sha256:v1:edited',
          organizationId: org.organizationId,
          userId: org.owner,
        }),
        forged: await insertWorkflow({
          metadata: { sourceTemplateId: template.id },
          organizationId: org.organizationId,
          userId: org.owner,
        }),
        brand: await insertWorkflow({
          brandId,
          organizationId: org.organizationId,
          userId: org.owner,
        }),
        installed: await insertWorkflow({
          organizationId: org.organizationId,
          templateInstantiationKey: `attempt-${org.suffix}`,
          userId: org.owner,
        }),
        member: await insertWorkflow({
          organizationId: org.organizationId,
          userId: org.member,
        }),
      };

      for (const id of Object.values(untouched)) {
        await expect(
          reconcileSeededWorkflowBeforeScheduledRun(
            deps,
            await asScheduled(id),
          ),
        ).resolves.not.toMatchObject({ status: 'marked' });
      }

      for (const id of Object.values(untouched)) {
        expect((await load(id)).platformSeedKey).toBeNull();
      }
      expect(
        await prisma.workflow.count({
          where: {
            organizationId: org.organizationId,
            platformSeedKey: { not: null },
          },
        }),
      ).toBe(0);
    });

    it('does not mark a row whose owner is no longer an active member', async () => {
      const org = await seedOrganization();
      const id = await insertWorkflow({
        organizationId: org.organizationId,
        userId: org.owner,
      });
      await prisma.member.updateMany({
        data: { isActive: false },
        where: { organizationId: org.organizationId, userId: org.owner },
      });

      await expect(
        reconcileSeededWorkflowBeforeScheduledRun(deps, await asScheduled(id)),
      ).resolves.toEqual({ status: 'unmarked' });
      expect((await load(id)).platformSeedKey).toBeNull();
    });

    it('never re-enables a paused schedule when the operator pass marks it', async () => {
      const org = await seedOrganization();
      const id = await insertWorkflow({
        isScheduleEnabled: false,
        organizationId: org.organizationId,
        userId: org.owner,
      });

      await expect(
        reconcilePlatformSeedMarker(deps, {
          organizationId: org.organizationId,
          template,
          userId: org.owner,
        }),
      ).resolves.toBe('marked');

      const row = await load(id);
      expect(row.platformSeedKey).toBe(template.id);
      expect(row.isScheduleEnabled).toBe(false);
    });

    it('marks the oldest row only, even with duplicates reconciling concurrently', async () => {
      const org = await seedOrganization();
      const oldest = await insertWorkflow({
        createdAt: new Date('2026-01-01T00:00:00Z'),
        organizationId: org.organizationId,
        userId: org.owner,
      });
      const duplicate = await insertWorkflow({
        createdAt: new Date('2026-02-01T00:00:00Z'),
        organizationId: org.organizationId,
        userId: org.owner,
      });
      const [oldestRow, duplicateRow] = await Promise.all([
        asScheduled(oldest),
        asScheduled(duplicate),
      ]);

      const results = await Promise.all(
        [oldestRow, duplicateRow, oldestRow, duplicateRow, oldestRow].map(
          (row) => reconcileSeededWorkflowBeforeScheduledRun(deps, row),
        ),
      );

      expect(
        results.filter((result) => result.status === 'marked'),
      ).toHaveLength(1);
      expect((await load(oldest)).platformSeedKey).toBe(template.id);
      expect((await load(duplicate)).platformSeedKey).toBeNull();
    });

    it('settles two concurrent reconciles of the same row on one marker', async () => {
      const org = await seedOrganization();
      const id = await insertWorkflow({
        organizationId: org.organizationId,
        userId: org.owner,
      });
      const input = {
        organizationId: org.organizationId,
        template,
        userId: org.owner,
      };

      const outcomes = await Promise.all(
        Array.from({ length: 6 }, () =>
          reconcilePlatformSeedMarker(deps, input),
        ),
      );

      expect(outcomes.filter((outcome) => outcome === 'marked')).toHaveLength(
        1,
      );
      expect(
        outcomes.every((outcome) =>
          ['already-marked', 'marked', 'no-canonical-row'].includes(outcome),
        ),
      ).toBe(true);
      expect(
        await prisma.workflow.count({
          where: {
            organizationId: org.organizationId,
            platformSeedKey: template.id,
          },
        }),
      ).toBe(1);
      expect((await load(id)).platformSeedKey).toBe(template.id);
    });

    it('is backed by the partial unique index: a second live marker is rejected', async () => {
      const org = await seedOrganization();
      const first = await insertWorkflow({
        organizationId: org.organizationId,
        userId: org.owner,
      });
      const second = await insertWorkflow({
        organizationId: org.organizationId,
        userId: org.owner,
      });
      await prisma.workflow.update({
        data: { platformSeedKey: template.id },
        where: { id: first },
      });

      await expect(
        prisma.workflow.update({
          data: { platformSeedKey: template.id },
          where: { id: second },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('loses the compare-and-set to a concurrent edit instead of marking an edited row', async () => {
      const org = await seedOrganization();
      const id = await insertWorkflow({
        organizationId: org.organizationId,
        userId: org.owner,
      });
      const stale = await asScheduled(id);
      // A tenant edit appends a version and moves the row on before the reconcile writes.
      const editedVersion = `version-edited-${id}`;
      await prisma.$transaction(async (tx) => {
        await tx.workflowVersion.create({
          data: {
            contentHash: 'sha256:v1:edited',
            graph: { edges: [], lockedNodeIds: [], nodes: [] },
            id: editedVersion,
            organizationId: org.organizationId,
            userId: org.owner,
            version: 2,
            workflowId: id,
          },
        });
        await tx.workflow.update({
          data: { currentVersionId: editedVersion },
          where: { id },
        });
      });

      // The reconcile re-reads the row, so the edit already fails the canonical check.
      await expect(
        reconcileSeededWorkflowBeforeScheduledRun(deps, stale),
      ).resolves.toEqual({ status: 'unmarked' });
      expect((await load(id)).platformSeedKey).toBeNull();
    });
  },
);
