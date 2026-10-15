import { randomUUID } from 'node:crypto';
import {
  type BrandRelocationActingUser,
  BrandRelocationService,
} from '@api/collections/brands/services/brand-relocation.service';
import { PersonaGrantReadService } from '@api/collections/personas/services/persona-grant-read.service';
import { WorkflowExecutorDocumentService } from '@api/collections/workflows/services/workflow-executor-document.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import { type Prisma, PrismaClient } from '@genfeedai/prisma';
import { ConflictException, ForbiddenException } from '@nestjs/common';
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
// The service resolves the scheduler through ModuleRef; the real class pulls in
// the whole workflow module graph, and the queue behind it needs Redis.
vi.mock(
  '@api/collections/workflows/services/workflow-scheduler.service',
  () => ({
    WorkflowSchedulerService: class WorkflowSchedulerService {},
  }),
);

// Explicit opt-in only: CI provisions this fully migrated, disposable database
// for the *.postgres.spec.ts suites. Never DATABASE_URL, never a shared server.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/test/i.test(url.pathname)
  ) {
    throw new Error('Brand relocation proof needs a disposable local database');
  }
}

type Seed = Awaited<ReturnType<typeof seed>>;

describe.skipIf(!connectionString)(
  'brand relocation against a fully migrated PostgreSQL (#6689)',
  () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: connectionString ?? '' }),
    });
    const unscheduleWorkflow = vi.fn().mockResolvedValue(undefined);
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const service = new BrandRelocationService(
      prisma as unknown as PrismaService,
      logger as never,
      {
        invalidate: vi.fn().mockResolvedValue(undefined),
        invalidateByTags: vi.fn().mockResolvedValue(undefined),
      } as never,
      {
        invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
      } as never,
      { get: () => ({ unscheduleWorkflow }) } as never,
    );

    beforeAll(async () => {
      await prisma.role.upsert({
        create: { key: MemberRole.OWNER, label: 'Owner' },
        update: {},
        where: { key: MemberRole.OWNER },
      });
    });
    beforeEach(() => {
      vi.clearAllMocks();
    });
    afterAll(async () => {
      await prisma.$disconnect();
    });

    const move = (s: Seed, to: string, actor = s.actor) =>
      service.relocateToOrganization(s.brand, { organizationId: to }, actor);

    async function orgOf(s: Seed): Promise<Record<string, string | null>> {
      const pick = async (
        read: Promise<{ organizationId: string | null } | null>,
      ) => (await read)?.organizationId ?? null;
      const select = { organizationId: true } as const;
      return {
        agentThread: await pick(
          prisma.agentThread.findUnique({ select, where: { id: s.thread } }),
        ),
        agentThreadEvent: await pick(
          prisma.agentThreadEvent.findFirst({
            select,
            where: { threadId: s.thread },
          }),
        ),
        agentThreadSnapshot: await pick(
          prisma.agentThreadSnapshot.findFirst({
            select,
            where: { threadId: s.thread },
          }),
        ),
        baselineReceipt: await pick(
          prisma.breakoutBaselineReceipt.findUnique({
            select,
            where: { id: s.baselineReceipt },
          }),
        ),
        brand: await pick(
          prisma.brand.findUnique({ select, where: { id: s.brand } }),
        ),
        breakoutOutput: await pick(
          prisma.breakoutResponseOutput.findUnique({
            select,
            where: { id: s.output },
          }),
        ),
        breakoutResponse: await pick(
          prisma.breakoutResponse.findUnique({
            select,
            where: { id: s.response },
          }),
        ),
        credential: await pick(
          prisma.credential.findUnique({ select, where: { id: s.credential } }),
        ),
        execution: await pick(
          prisma.workflowExecution.findUnique({
            select,
            where: { id: s.execution },
          }),
        ),
        exposureObservation: await pick(
          prisma.postExposureObservation.findUnique({
            select,
            where: { id: s.observation },
          }),
        ),
        ingredient: await pick(
          prisma.ingredient.findUnique({ select, where: { id: s.ingredient } }),
        ),
        llmVendorCost: await pick(
          prisma.llmVendorCost.findUnique({
            select,
            where: { id: s.vendorCost },
          }),
        ),
        nodeArtifact: await pick(
          prisma.workflowArtifact.findFirst({
            select,
            where: { executionId: s.execution },
          }),
        ),
        nodeClaim: await pick(
          prisma.workflowNodeClaim.findFirst({
            select,
            where: { executionId: s.execution },
          }),
        ),
        nodeContinuation: await pick(
          prisma.workflowNodeContinuation.findFirst({
            select,
            where: { executionId: s.execution },
          }),
        ),
        nodeResult: await pick(
          prisma.workflowExecutionNodeResult.findFirst({
            select,
            where: { executionId: s.execution },
          }),
        ),
        persona: await pick(
          prisma.persona.findUnique({ select, where: { id: s.persona } }),
        ),
        post: await pick(
          prisma.post.findUnique({ select, where: { id: s.post } }),
        ),
        postIngredient: await pick(
          prisma.postIngredient.findFirst({
            select,
            where: { postId: s.post },
          }),
        ),
        postReceipt: await pick(
          prisma.postProviderPublishReceipt.findFirst({
            select,
            where: { postId: s.post },
          }),
        ),
        threadContext: await pick(
          prisma.threadContextState.findFirst({
            select,
            where: { threadId: s.thread },
          }),
        ),
        workflow: await pick(
          prisma.workflow.findUnique({ select, where: { id: s.workflow } }),
        ),
        workflowVersion: await pick(
          prisma.workflowVersion.findUnique({
            select,
            where: { id: s.version },
          }),
        ),
      };
    }

    const everythingIn = (organizationId: string, ...except: string[]) =>
      expect.objectContaining({
        ...Object.fromEntries(
          [
            'agentThread',
            'agentThreadEvent',
            'agentThreadSnapshot',
            'baselineReceipt',
            'brand',
            'breakoutOutput',
            'breakoutResponse',
            'credential',
            'execution',
            'exposureObservation',
            'ingredient',
            'nodeArtifact',
            'nodeClaim',
            'nodeContinuation',
            'nodeResult',
            'persona',
            'post',
            'postIngredient',
            'postReceipt',
            'threadContext',
            'workflow',
            'workflowVersion',
          ]
            .filter((name) => !except.includes(name))
            .map((name) => [name, organizationId]),
        ),
      });

    it('keeps every cascading composite organization key deferrable, so a move can commit', async () => {
      const notDeferrable = await prisma.$queryRaw<
        Array<{ constraint: string; table: string }>
      >`
        SELECT c.relname AS "table", con.conname AS "constraint"
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype = 'f' AND n.nspname = current_schema()
          AND con.confupdtype = 'c' AND NOT con.condeferrable
          AND array_length(con.conkey, 1) > 1
          AND EXISTS (
            SELECT 1 FROM unnest(con.conkey) AS k(attnum)
            JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
            WHERE a.attname ~* '(organization|org)id$'
          )
        ORDER BY 1, 2`;

      expect(notDeferrable).toEqual([]);
    });

    it('moves every org-only child with its parent and commits with the breakout and exposure foreign keys in place', async () => {
      const s = await seed(prisma);
      expect(await orgOf(s)).toEqual(everythingIn(s.source, 'llmVendorCost'));

      const preview = await service.previewRelocation(
        s.brand,
        s.destination,
        s.actor,
      );
      expect(preview.schedulesToHold).toEqual([
        {
          id: s.workflow,
          label: 'Daily post',
          schedule: '0 9 * * *',
          timezone: 'Europe/Berlin',
        },
      ]);
      const previewed = new Map(
        preview.movingResources.map((item) => [item.resource, item.count]),
      );
      for (const resource of [
        'workflowVersion',
        'workflowExecutionNodeResult',
        'workflowArtifact',
        'workflowNodeClaim',
        'workflowNodeContinuation',
        'agentThreadEvent',
        'agentThreadSnapshot',
        'threadContextState',
        'postProviderPublishReceipt',
        'postIngredient',
      ]) {
        expect(previewed.get(resource), resource).toBe(1);
      }

      const { brand, summary } = await move(s, s.destination);

      expect(brand.organizationId).toBe(s.destination);
      expect(await orgOf(s)).toEqual(everythingIn(s.destination));
      expect(summary).toMatchObject({
        personaGrantsRevoked: 1,
        personasSharingReset: 1,
        schedulesHeld: 1,
        schedulingPending: 0,
        workflowsMoved: 1,
      });
      expect(summary.schedulesHeld).toBe(preview.counts.schedulesToHold);

      // A pinned load needs the version, the workflow and the caller to agree
      // on one organization; before the version moved it failed on a mismatch.
      const documents = new WorkflowExecutorDocumentService(
        prisma as unknown as PrismaService,
      );
      await expect(
        documents.findPinnedWorkflow(
          s.workflow,
          s.version,
          s.destination,
          s.owner,
        ),
      ).resolves.toMatchObject({ id: s.workflow });

      // Billing history stays with the organization that was billed, tagged
      // with the brand it was attributed to.
      await expect(
        prisma.creditTransaction.findUniqueOrThrow({
          where: { id: s.creditTransaction },
        }),
      ).resolves.toMatchObject({ brandId: s.brand, organizationId: s.source });
      // The vendor cost follows the brand through its composite foreign key.
      await expect(
        prisma.llmVendorCost.findUniqueOrThrow({
          where: { id: s.vendorCost },
        }),
      ).resolves.toMatchObject({ organizationId: s.destination });
    });

    it('pauses the schedule and clears its actor, keeping cron and timezone, and removes the queued job after commit', async () => {
      const s = await seed(prisma);

      await move(s, s.destination);

      await expect(
        prisma.workflow.findUniqueOrThrow({ where: { id: s.workflow } }),
      ).resolves.toMatchObject({
        isScheduleEnabled: false,
        schedule: '0 9 * * *',
        scheduleInitiatingActor: null,
        timezone: 'Europe/Berlin',
      });
      expect(unscheduleWorkflow).toHaveBeenCalledWith(s.workflow);
    });

    it('revokes the persona grant and audits it, and refuses a stale grant on read', async () => {
      const s = await seed(prisma);

      await move(s, s.destination);

      const grant = await prisma.personaGrant.findUniqueOrThrow({
        where: { id: s.grant },
      });
      expect(grant.revokedAt).toBeInstanceOf(Date);
      expect(grant.revokedByUserId).toBe(s.owner);
      await expect(
        prisma.personaGrantAudit.findMany({ where: { grantId: s.grant } }),
      ).resolves.toEqual([
        expect.objectContaining({
          action: 'revoked',
          actorUserId: s.owner,
          ownerOrganizationId: s.source,
          personaId: s.persona,
          recipientOrganizationId: s.recipient,
        }),
      ]);

      // An older grant row that still names the previous owner must not share
      // the character the new owner holds.
      await prisma.personaGrant.create({
        data: {
          grantedByUserId: s.owner,
          ownerOrganizationId: s.source,
          personaId: s.persona,
          recipientOrganizationId: s.recipient,
        },
      });
      await expect(
        new PersonaGrantReadService(
          prisma as unknown as PrismaService,
        ).findForBrand({
          brandId: s.recipientBrand,
          organizationId: s.recipient,
          personaId: s.persona,
        }),
      ).resolves.toBeNull();
    });

    it('resets a shared character to its owning brand in the move, and leaves an owning-only one alone', async () => {
      const s = await seed(prisma);
      // A second character that lists brands, the other kind of sharing.
      const listed = (
        await prisma.persona.create({
          data: {
            availabilityMode: 'SELECTED_BRANDS',
            availableBrandIds: [s.recipientBrand],
            brandId: s.brand,
            handle: `kai-${randomUUID()}`,
            label: 'Kai',
            organizationId: s.source,
            userId: s.owner,
          },
        })
      ).id;

      const preview = await service.previewRelocation(
        s.brand,
        s.destination,
        s.actor,
      );
      expect(preview.personasToReset.map((item) => item.id).sort()).toEqual(
        [s.sharedPersona, listed].sort(),
      );

      const { summary } = await move(s, s.destination);

      expect(summary.personasSharingReset).toBe(2);
      expect(summary.personasSharingReset).toBe(preview.counts.personasToReset);
      for (const personaId of [s.sharedPersona, listed]) {
        await expect(
          prisma.persona.findUniqueOrThrow({ where: { id: personaId } }),
        ).resolves.toMatchObject({
          availabilityMode: 'OWNING_BRAND',
          availableBrandIds: [],
          brandId: s.brand,
          organizationId: s.destination,
        });
      }
      await expect(
        prisma.persona.findUniqueOrThrow({ where: { id: s.persona } }),
      ).resolves.toMatchObject({
        availabilityMode: 'OWNING_BRAND',
        availableBrandIds: [],
        organizationId: s.destination,
      });
      const audits = await prisma.personaAvailabilityAudit.findMany({
        orderBy: { previousMode: 'asc' },
        where: { personaId: { in: [s.persona, s.sharedPersona, listed] } },
      });
      expect(audits).toEqual([
        expect.objectContaining({
          actorUserId: s.owner,
          newBrandIds: [],
          newMode: 'OWNING_BRAND',
          organizationId: s.source,
          personaId: s.sharedPersona,
          previousBrandIds: [],
          previousMode: 'ALL_BRANDS',
        }),
        expect.objectContaining({
          newMode: 'OWNING_BRAND',
          personaId: listed,
          previousBrandIds: [s.recipientBrand],
          previousMode: 'SELECTED_BRANDS',
        }),
      ]);
    });

    it('rolls the sharing reset back with the rest of the move when the transaction aborts', async () => {
      const s = await seed(prisma);
      const abortingPrisma = new Proxy(prisma, {
        get(target, property) {
          if (property === '$transaction') {
            return (
              work: (tx: Prisma.TransactionClient) => Promise<unknown>,
              options: Parameters<typeof prisma.$transaction>[1],
            ) =>
              prisma.$transaction(async (tx) => {
                await work(tx);
                throw new Error('abort after the whole move ran');
              }, options);
          }
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const aborting = new BrandRelocationService(
        abortingPrisma as unknown as PrismaService,
        logger as never,
        {
          invalidate: vi.fn().mockResolvedValue(undefined),
          invalidateByTags: vi.fn().mockResolvedValue(undefined),
        } as never,
        {
          invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
        } as never,
        { get: () => ({ unscheduleWorkflow }) } as never,
      );

      await expect(
        aborting.relocateToOrganization(
          s.brand,
          { organizationId: s.destination },
          s.actor,
        ),
      ).rejects.toThrow('abort after the whole move ran');

      await expect(
        prisma.persona.findUniqueOrThrow({ where: { id: s.sharedPersona } }),
      ).resolves.toMatchObject({
        availabilityMode: 'ALL_BRANDS',
        organizationId: s.source,
      });
      await expect(
        prisma.personaAvailabilityAudit.count({
          where: { personaId: s.sharedPersona },
        }),
      ).resolves.toBe(0);
      expect(await orgOf(s)).toEqual(everythingIn(s.source, 'llmVendorCost'));
    });

    it('moving A to B and back brings back no actor and no grant', async () => {
      const s = await seed(prisma);
      await move(s, s.destination);
      // Someone in the new organization saves the schedule: #6682 binds them.
      await prisma.workflow.update({
        data: {
          isScheduleEnabled: true,
          scheduleInitiatingActor: {
            organizationId: s.destination,
            userId: s.owner,
          },
        },
        where: { id: s.workflow },
      });
      // A strategy saved there binds its actor too (#6718).
      const strategy = await prisma.agentStrategy.create({
        data: {
          brandId: s.brand,
          organizationId: s.destination,
          scheduleInitiatingActor: {
            isApiKey: false,
            organizationId: s.destination,
            scopes: [],
            userId: s.owner,
          },
          userId: s.owner,
        },
      });

      const back = await move(s, s.source);

      await expect(
        prisma.agentStrategy.findUniqueOrThrow({ where: { id: strategy.id } }),
      ).resolves.toMatchObject({
        organizationId: s.source,
        scheduleInitiatingActor: null,
      });
      expect(back.summary.schedulesHeld).toBe(1);
      expect(await orgOf(s)).toEqual(everythingIn(s.source));
      await expect(
        prisma.workflow.findUniqueOrThrow({ where: { id: s.workflow } }),
      ).resolves.toMatchObject({
        isScheduleEnabled: false,
        schedule: '0 9 * * *',
        scheduleInitiatingActor: null,
      });
      await expect(
        prisma.personaGrant.count({
          where: { personaId: s.persona, revokedAt: null },
        }),
      ).resolves.toBe(0);
    });

    describe('while work is in flight', () => {
      async function assertNothingMoved(s: Seed) {
        expect(await orgOf(s)).toEqual(everythingIn(s.source, 'llmVendorCost'));
        await expect(
          prisma.workflow.findUniqueOrThrow({ where: { id: s.workflow } }),
        ).resolves.toMatchObject({
          isScheduleEnabled: true,
          scheduleInitiatingActor: expect.objectContaining({
            userId: s.owner,
          }),
        });
        await expect(
          prisma.personaGrant.findUniqueOrThrow({ where: { id: s.grant } }),
        ).resolves.toMatchObject({ revokedAt: null });
        await expect(
          prisma.persona.findUniqueOrThrow({ where: { id: s.sharedPersona } }),
        ).resolves.toMatchObject({ availabilityMode: 'ALL_BRANDS' });
        expect(unscheduleWorkflow).not.toHaveBeenCalled();
      }

      it('answers 409 and rolls everything back while an execution is running', async () => {
        const s = await seed(prisma, { executionStatus: 'RUNNING' });

        await expect(move(s, s.destination)).rejects.toBeInstanceOf(
          ConflictException,
        );
        await assertNothingMoved(s);
      });

      it('answers 409 while a provider publish is uncertain', async () => {
        const s = await seed(prisma, { receiptStatus: 'uncertain' });

        await expect(move(s, s.destination)).rejects.toThrow(
          /still being resolved/,
        );
        await assertNothingMoved(s);
      });

      it('answers 409 while a credit hold is open on an execution', async () => {
        const s = await seed(prisma);
        await prisma.creditReservation.create({
          data: {
            billingAccountId: s.billingAccount,
            expiresAt: new Date(Date.now() + 3_600_000),
            idempotencyKey: `hold-${randomUUID()}`,
            organizationId: s.source,
            status: 'RESERVED',
            amount: 5,
            workflowExecutionId: s.execution,
          },
        });

        await expect(move(s, s.destination)).rejects.toThrow(
          /open credit holds/,
        );
        await assertNothingMoved(s);
      });

      it('answers 409 for a brand whose executions carry append-only authorization history', async () => {
        const s = await seed(prisma);
        await prisma.workflowExecutionReadScope.create({
          data: {
            executionId: s.execution,
            family: 'AUTHORED',
            organizationId: s.source,
            producer: 'fixture',
            rootContentHash: 'sha256:v1:fixture',
          },
        });

        await expect(move(s, s.destination)).rejects.toThrow(
          /authorization history/,
        );
        await assertNothingMoved(s);
      });

      it('answers 409 for a brand with a finalized publication, which is retained history', async () => {
        const s = await seed(prisma, { hasFinalization: true });

        await expect(move(s, s.destination)).rejects.toThrow(
          /learning or publication history/,
        );
        await assertNothingMoved(s);
      });

      it('answers 409 for a brand with an immutable content version pin', async () => {
        const s = await seed(prisma);
        await prisma.contentVersionPin.create({
          data: {
            brandId: s.brand,
            contentDigest: `sha256:v1:${'a'.repeat(64)}`,
            createdByUserId: s.owner,
            idempotencyKey: `pin-${randomUUID()}`,
            organizationId: s.source,
            recordId: s.post,
            recordKind: 'post',
          },
        });

        await expect(move(s, s.destination)).rejects.toBeInstanceOf(
          ConflictException,
        );
        await assertNothingMoved(s);
      });
    });

    it('denies an API key without an explicit admin scope before anything moves', async () => {
      const s = await seed(prisma);

      await expect(
        move(s, s.destination, {
          ...s.actor,
          isApiKey: true,
          scopes: ['read'],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect((await orgOf(s)).brand).toBe(s.source);

      await expect(
        move(s, s.destination, {
          ...s.actor,
          isApiKey: true,
          scopes: ['admin'],
        }),
      ).resolves.toMatchObject({ brand: { organizationId: s.destination } });
    });
  },
);

interface SeedOptions {
  /** A finalized publication is retained history: it keeps the brand where it is. */
  hasFinalization?: boolean;
  executionStatus?: 'COMPLETED' | 'RUNNING';
  receiptStatus?: 'accepted' | 'uncertain';
}

/** One brand in `source` with everything the relocation has to carry or refuse. */
async function seed(prisma: PrismaClient, options: SeedOptions = {}) {
  const suffix = randomUUID();
  const id = (name: string) => `${name}-${suffix}`;
  const owner = id('owner');
  const [source, destination, recipient] = [
    id('source'),
    id('destination'),
    id('recipient'),
  ];
  const brand = id('brand');
  const fallbackBrand = id('fallback');
  const destinationBrand = id('dest-brand');
  const recipientBrand = id('recipient-brand');
  const [workflow, version, execution] = [
    id('workflow'),
    id('version'),
    id('execution'),
  ];
  const now = new Date();
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: MemberRole.OWNER },
  });

  await prisma.user.create({ data: { handle: owner, id: owner } });
  for (const organizationId of [source, destination, recipient]) {
    await prisma.organization.create({
      data: {
        id: organizationId,
        label: organizationId,
        slug: organizationId,
        userId: owner,
      },
    });
  }
  const brands: Array<[string, string]> = [
    [brand, source],
    [fallbackBrand, source],
    [destinationBrand, destination],
    [recipientBrand, recipient],
  ];
  for (const [brandId, organizationId] of brands) {
    await prisma.brand.create({
      data: {
        id: brandId,
        label: brandId,
        organizationId,
        slug: brandId,
        userId: owner,
      },
    });
  }
  const memberships: Array<[string, string]> = [
    [source, brand],
    [destination, destinationBrand],
  ];
  for (const [organizationId, currentBrandId] of memberships) {
    await prisma.member.create({
      data: {
        currentBrandId,
        organizationId,
        roleId: role.id,
        roleKey: MemberRole.OWNER,
        userId: owner,
      },
    });
  }

  // The current-version foreign key is deferred, so the workflow goes first.
  await prisma.$transaction(async (tx) => {
    await tx.workflow.create({
      data: {
        brandId: brand,
        currentVersionId: version,
        id: workflow,
        isScheduleEnabled: true,
        label: 'Daily post',
        organizationId: source,
        schedule: '0 9 * * *',
        scheduleInitiatingActor: {
          organizationId: source,
          userId: owner,
        } satisfies Prisma.InputJsonObject,
        status: 'active',
        timezone: 'Europe/Berlin',
        userId: owner,
      },
    });
    await tx.workflowVersion.create({
      data: {
        contentHash: 'sha256:v1:fixture',
        graph: { edges: [], lockedNodeIds: [], nodes: [] },
        id: version,
        organizationId: source,
        userId: owner,
        version: 1,
        workflowId: workflow,
      },
    });
  });
  await prisma.workflowExecution.create({
    data: {
      id: execution,
      organizationId: source,
      status: options.executionStatus ?? 'COMPLETED',
      userId: owner,
      workflowId: workflow,
      workflowVersionId: version,
    },
  });
  await prisma.workflowExecutionNodeResult.create({
    data: {
      executionId: execution,
      nodeId: 'node-1',
      nodeType: 'action',
      organizationId: source,
      status: 'completed',
    },
  });
  await prisma.workflowArtifact.create({
    data: {
      executionId: execution,
      expiresAt: new Date(now.getTime() + 86_400_000),
      kind: 'image',
      nodeId: 'node-1',
      organizationId: source,
      storageKey: id('artifact'),
    },
  });
  await prisma.workflowNodeClaim.create({
    data: {
      executionId: execution,
      nodeId: 'node-1',
      organizationId: source,
      status: 'completed',
    },
  });
  const ingredient = (
    await prisma.ingredient.create({
      data: { brandId: brand, organizationId: source, userId: owner },
    })
  ).id;
  await prisma.workflowNodeContinuation.create({
    data: {
      actionId: 'imageGen',
      executionId: execution,
      ingredientId: ingredient,
      nodeId: 'node-1',
      organizationId: source,
      provider: 'fal',
      status: 'COMPLETED',
      workflowVersionId: version,
    },
  });

  const thread = (
    await prisma.agentThread.create({
      data: { brandId: brand, organizationId: source, userId: owner },
    })
  ).id;
  await prisma.agentThreadEvent.create({
    data: { organizationId: source, sequence: 1, threadId: thread },
  });
  await prisma.agentThreadSnapshot.create({
    data: { organizationId: source, threadId: thread },
  });
  await prisma.threadContextState.create({
    data: { organizationId: source, threadId: thread },
  });

  const persona = (
    await prisma.persona.create({
      data: {
        brandId: brand,
        handle: id('anna'),
        label: 'Anna',
        organizationId: source,
        userId: owner,
      },
    })
  ).id;
  // A character the brand shares with every brand of its organization: the
  // move limits it to the owning brand.
  const sharedPersona = (
    await prisma.persona.create({
      data: {
        availabilityMode: 'ALL_BRANDS',
        brandId: brand,
        handle: id('mira'),
        label: 'Mira',
        organizationId: source,
        userId: owner,
      },
    })
  ).id;
  const grant = (
    await prisma.personaGrant.create({
      data: {
        grantedByUserId: owner,
        ownerOrganizationId: source,
        personaId: persona,
        recipientOrganizationId: recipient,
      },
    })
  ).id;

  const post = (
    await prisma.post.create({
      data: {
        brandId: brand,
        description: 'A post',
        organizationId: source,
        userId: owner,
      },
    })
  ).id;
  // The post's ordered media link carries the post's organization.
  await prisma.postIngredient.create({
    data: {
      ingredientId: ingredient,
      organizationId: source,
      position: 0,
      postId: post,
    },
  });
  await prisma.postProviderPublishReceipt.create({
    data: {
      attemptStartedAt: now,
      attemptToken: id('attempt'),
      leaseRenewedAt: now,
      occurrenceKey: id('occurrence'),
      organizationId: source,
      postId: post,
      status: options.receiptStatus ?? 'accepted',
      workflowExecutionId: execution,
    },
  });
  if (options.hasFinalization) {
    await prisma.postPublishFinalization.create({
      data: {
        organizationId: source,
        postId: post,
        result: {},
        source: 'test',
      },
    });
  }

  const credential = (
    await prisma.credential.create({
      data: {
        brandId: brand,
        organizationId: source,
        platform: 'TWITTER',
        userId: owner,
      },
    })
  ).id;
  const observation = (
    await prisma.postExposureObservation.create({
      data: {
        brandId: brand,
        contentDigest: 'digest',
        credentialId: credential,
        exposures: [],
        externalId: id('external'),
        format: 'text',
        isResponse: false,
        logicalPostId: id('logical'),
        organizationId: source,
        platform: 'twitter',
        postId: post,
        publicationFingerprint: 'publication',
        publishedAt: now,
        receivedAt: now,
        requestStartedAt: now,
        sourceAttemptId: id('attempt'),
        sourceFingerprint: 'source',
      },
    })
  ).id;
  const baselineReceipt = (
    await prisma.breakoutBaselineReceipt.create({
      data: {
        brandId: brand,
        credentialId: credential,
        evaluatedAt: now,
        evaluation: {},
        evidenceFingerprint: 'evidence',
        format: 'text',
        idempotencyKey: id('idempotency'),
        metric: 'views',
        optionsFingerprint: 'options',
        organizationId: source,
        platform: 'twitter',
        targetObservationId: observation,
      },
    })
  ).id;
  const response = (
    await prisma.breakoutResponse.create({
      data: {
        brandId: brand,
        contentDigest: 'digest',
        credentialId: credential,
        detectedAt: now,
        externalId: id('response-external'),
        logicalPostId: id('logical'),
        organizationId: source,
        platform: 'twitter',
        publicationFingerprint: 'publication',
        sourcePostId: post,
        state: 'suppressed',
        triggerReceiptId: baselineReceipt,
      },
    })
  ).id;
  const output = (
    await prisma.breakoutResponseOutput.create({
      data: {
        brandId: brand,
        credentialId: credential,
        format: 'text',
        generationKey: id('generation'),
        kind: 'follow_up',
        ordinal: 1,
        organizationId: source,
        responseId: response,
        state: 'suppressed',
      },
    })
  ).id;

  const vendorCost = (
    await prisma.llmVendorCost.create({
      data: {
        brandId: brand,
        model: 'fixture',
        organizationId: source,
        provider: 'fixture',
      },
    })
  ).id;
  const creditTransaction = (
    await prisma.creditTransaction.create({
      data: { amount: 1, brandId: brand, organizationId: source },
    })
  ).id;
  const billingAccount = (await prisma.billingAccount.create({ data: {} })).id;

  return {
    actor: { isSuperAdmin: false, userId: owner } as BrandRelocationActingUser,
    baselineReceipt,
    billingAccount,
    brand,
    credential,
    creditTransaction,
    destination,
    execution,
    grant,
    ingredient,
    observation,
    output,
    owner,
    persona,
    post,
    recipient,
    recipientBrand,
    response,
    sharedPersona,
    source,
    thread,
    vendorCost,
    version,
    workflow,
  };
}
