import { createHash } from 'node:crypto';
import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import type { CreateVisualProjectDto } from '@api/collections/visual-projects/dto/create-visual-project.dto';
import {
  createTestBrand,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import {
  CreditReservationStatus,
  IngredientCategory,
  IngredientStatus,
  VisualCodeStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { VISUAL_CODE_RENDERER_VERSION } from '@genfeedai/contracts/constants';
import { WORKFLOW_EXECUTION_QUEUE } from '@genfeedai/contracts/queue';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createVisualCodeAcceptanceFixture,
  seedVisualCodeAcceptanceActor,
  type VisualCodeAcceptanceActor,
  type VisualCodeAcceptanceFixture,
} from './visual-code-acceptance.fixture';

const SETTINGS = { width: 640, height: 360, fps: 30, durationFrames: 30 };
const OUTPUTS = [
  { format: 'mp4' as const },
  { format: 'png' as const, frame: 0 },
];
const projectResponse = z.object({
  data: z.object({
    id: z.string(),
    attributes: z
      .object({
        revisions: z.array(
          z
            .object({
              id: z.string(),
              status: z.string(),
              progress: z.number(),
              hasSource: z.boolean(),
              sourceHash: z.string().nullable(),
              settings: z.unknown(),
              outputs: z.array(
                z.object({
                  ingredientId: z.string(),
                  format: z.string(),
                  frame: z.number().optional(),
                }),
              ),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  }),
});
const quoteResponse = z.object({
  data: z.object({
    attributes: z.object({ maximumCredits: z.number().positive() }),
  }),
});
const catalogResponse = z.object({
  data: z.object({
    attributes: z.object({
      isAvailable: z.boolean(),
      unavailableReason: z.string().nullable().optional(),
      models: z.array(z.object({ key: z.string() }).passthrough()),
    }),
  }),
});
const libraryResponse = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      attributes: z.record(z.string(), z.unknown()),
    }),
  ),
});

function createInput(
  actor: VisualCodeAcceptanceActor,
  maximumCredits: number,
  requestId = 'visual-acceptance-create',
): CreateVisualProjectDto {
  return {
    brandId: actor.brandId,
    requestId,
    label: 'Visual acceptance',
    prompt: 'Animate a title',
    modelKey: 'openai/visual-acceptance',
    settings: SETTINGS,
    sourceAssetIds: [actor.sourceAssetId],
    outputs: OUTPUTS,
    maximumCredits,
  };
}
async function quote(
  fixture: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
  input: CreateVisualProjectDto,
) {
  const response = await fixture.controller.quote(
    fixture.request(actor.user),
    actor.user,
    { operation: 'create', input: { ...input } },
  );
  return quoteResponse.parse(response).data.attributes.maximumCredits;
}
async function persistedSnapshot(
  fixture: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
) {
  const where = { organizationId: actor.organizationId, isDeleted: false };
  const [
    projects,
    revisions,
    ingredients,
    reservations,
    executions,
    transactions,
  ] = await Promise.all([
    fixture.prisma.visualProject.findMany({ where, orderBy: { id: 'asc' } }),
    fixture.prisma.visualRevision.findMany({ where, orderBy: { id: 'asc' } }),
    fixture.prisma.ingredient.findMany({
      where,
      orderBy: { id: 'asc' },
      include: { metadata: true },
    }),
    fixture.prisma.creditReservation.findMany({
      where,
      orderBy: { id: 'asc' },
    }),
    fixture.prisma.workflowExecution.findMany({
      where,
      orderBy: { id: 'asc' },
    }),
    fixture.prisma.creditTransaction.findMany({
      where,
      orderBy: { id: 'asc' },
    }),
  ]);
  return {
    projectIds: projects.map((row) => row.id),
    revisionIds: revisions.map((row) => row.id),
    ingredientIds: ingredients.map((row) => row.id),
    metadataIds: ingredients.map((row) => row.metadataId),
    reservationIds: reservations.map((row) => row.id),
    executionIds: executions.map((row) => row.id),
    transactions: transactions.map((row) => ({
      id: row.id,
      amount: row.amount,
      reservationId: row.reservationId,
    })),
    wallet: await fixture.credits.getWalletSnapshot(actor.organizationId),
    jobs: [...fixture.queues.values()]
      .flatMap((queue) => [...queue.jobs.keys()])
      .sort(),
  };
}
function expectNoGeneration(fixture: VisualCodeAcceptanceFixture) {
  expect(fixture.calls.llm).toEqual([]);
  expect(fixture.calls.rendererSubmissions).toEqual([]);
  expect(fixture.calls.uploads).toEqual([]);
  expect(fixture.calls.renderer.every((call) => call === 'GET /health')).toBe(
    true,
  );
}
async function libraryIds(
  fixture: VisualCodeAcceptanceFixture,
  actor: VisualCodeAcceptanceActor,
) {
  const query = new IngredientsQueryDto();
  query.brandId = actor.brandId;
  query.status = [IngredientStatus.GENERATED];
  query.limit = 100;
  const response = libraryResponse.parse(
    await fixture.library.findAll(
      fixture.request(actor.user, '/ingredients'),
      query,
      actor.user,
    ),
  );
  return response.data.map((row) => row.id);
}

describe('visual-code connected backend and canonical Library acceptance', () => {
  let fixture: VisualCodeAcceptanceFixture | undefined;
  afterEach(async () => {
    await fixture?.close();
    fixture = undefined;
  });

  it('reserves, executes a pinned workflow with a real lease, settles once and exposes the same canonical outputs on replay', async () => {
    fixture = await createVisualCodeAcceptanceFixture();
    const actor = await seedVisualCodeAcceptanceActor(fixture);
    const other = await seedVisualCodeAcceptanceActor(fixture);
    const catalog = catalogResponse.parse(
      await fixture.controller.catalog(
        fixture.request(actor.user),
        actor.user,
        actor.brandId,
      ),
    );
    expect(catalog.data.attributes.isAvailable).toBe(true);
    expect(
      catalog.data.attributes.models.some(
        (model) => model.key === fixture?.paidModel,
      ),
    ).toBe(true);
    const baseline = await fixture.credits.getWalletSnapshot(
      actor.organizationId,
    );
    const maximumCredits = await quote(fixture, actor, createInput(actor, 1));
    const input = createInput(actor, maximumCredits);
    fixture.resetExternalCalls();
    const created = projectResponse.parse(
      await fixture.controller.create(
        fixture.request(actor.user),
        actor.user,
        input,
      ),
    );
    const projectId = created.data.id;
    const queued = await fixture.prisma.visualRevision.findFirstOrThrow({
      where: {
        projectId,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    expect(queued.status).toBe(VisualCodeStatus.QUEUED);
    expect(queued.reservationId).toBeTruthy();
    expect(queued.workflowExecutionId).toBeTruthy();
    const reservation = await fixture.prisma.creditReservation.findFirstOrThrow(
      {
        where: {
          id: queued.reservationId ?? '',
          organizationId: actor.organizationId,
          isDeleted: false,
        },
      },
    );
    expect(reservation.status).toBe(CreditReservationStatus.RESERVED);
    expect(reservation.amount).toBe(maximumCredits);
    expect(
      (await fixture.credits.getWalletSnapshot(actor.organizationId)).held -
        baseline.held,
    ).toBeCloseTo(maximumCredits, 8);
    const queues = [...fixture.queues.values()];
    expect(queues.filter((queue) => queue.jobs.size)).toHaveLength(1);
    const queue = fixture.queues.get(WORKFLOW_EXECUTION_QUEUE);
    expect(queue?.jobs.size).toBe(1);
    const job = [...(queue?.jobs.values() ?? [])][0];
    expect(job?.name).toBe('system-run');
    expect(job?.data.type).toBe('system-run');
    expect(job?.data.systemRun?.input.canonicalId).toBe('visual-code.execute');
    const executionBefore =
      await fixture.prisma.workflowExecution.findFirstOrThrow({
        where: {
          id: queued.workflowExecutionId ?? '',
          organizationId: actor.organizationId,
          isDeleted: false,
        },
        include: { workflowVersion: true },
      });
    expect(executionBefore.workflowVersionId).toBe(
      executionBefore.workflowVersion.id,
    );
    expect(executionBefore.workflowVersion.graph).toMatchObject({
      nodes: [
        expect.objectContaining({
          type: 'genfeedAction',
          data: expect.objectContaining({
            config: expect.objectContaining({
              actionId: 'visual-code.execute-internal',
            }),
          }),
        }),
      ],
    });
    await fixture.drainNextWorkflowJob();
    const completed = projectResponse.parse(
      await fixture.controller.get(
        fixture.request(actor.user),
        actor.user,
        projectId,
      ),
    );
    const publicRevision = completed.data.attributes.revisions[0];
    expect(publicRevision).toBeDefined();
    if (!publicRevision) throw new Error('Completed public revision absent');
    expect(publicRevision.status).toBe(VisualCodeStatus.COMPLETED);
    expect(publicRevision.progress).toBe(100);
    expect(publicRevision.hasSource).toBe(true);
    expect(publicRevision.settings).toEqual(SETTINGS);
    expect(publicRevision.outputs).toHaveLength(2);
    for (const key of [
      'sourceCode',
      'reservationId',
      'workflowExecutionId',
      'userId',
      'organizationId',
      'brandId',
      'createdAt',
      'updatedAt',
      'cancelRequestedAt',
      'inputHash',
      'isDeleted',
    ])
      expect(publicRevision).not.toHaveProperty(key);
    const revision = await fixture.prisma.visualRevision.findFirstOrThrow({
      where: {
        id: queued.id,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    expect(revision.rendererVersion).toBe(VISUAL_CODE_RENDERER_VERSION);
    expect(revision.sourceCode).toBeTruthy();
    expect(publicRevision.sourceHash).toBe(
      createHash('sha256')
        .update(revision.sourceCode ?? '')
        .digest('hex'),
    );
    expect(revision.settings).toEqual(SETTINGS);
    expect(revision.inputHash).toMatch(/^[a-f0-9]{64}$/);
    const outputIds = publicRevision.outputs.map(
      (output) => output.ingredientId,
    );
    expect(new Set(outputIds).size).toBe(2);
    const rows = await fixture.prisma.ingredient.findMany({
      where: {
        id: { in: outputIds },
        organizationId: actor.organizationId,
        isDeleted: false,
      },
      include: { metadata: true },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.brandId).toBe(actor.brandId);
      expect(row.userId).toBe(actor.userId);
      expect(row.status).toBe(IngredientStatus.GENERATED);
      expect(row.isDeleted).toBe(false);
      expect(row.s3Key).toMatch(
        new RegExp(
          `^visual-code/${actor.organizationId}/${actor.brandId}/${revision.id}/outputs/`,
        ),
      );
      expect(row.generationSource).toBe(`visual-code:${projectId}@1`);
      expect(row.sourceActionId).toBe('visual-code.generate');
      expect(row.modelUsed).toBe(fixture.paidModel);
      const uploaded = fixture.objects.get(row.s3Key ?? '');
      expect(uploaded).toBeDefined();
      if (!uploaded) throw new Error('Canonical upload bytes absent');
      expect(row.fileSize).toBe(uploaded.length);
      expect(row.fileSize).toBeGreaterThan(0);
      const provenance = z
        .object({
          sourceHash: z.string(),
          outputHash: z.string(),
          authoringModel: z.string(),
          inspectionModel: z.string(),
          rendererVersion: z.string(),
        })
        .parse(row.providerData);
      expect(provenance.sourceHash).toBe(revision.sourceHash);
      expect(provenance.outputHash).toBe(
        createHash('sha256').update(uploaded).digest('hex'),
      );
      expect(provenance.authoringModel).toBe(fixture.paidModel);
      expect(provenance.inspectionModel).toBe(fixture.paidModel);
      expect(provenance.rendererVersion).toBe(VISUAL_CODE_RENDERER_VERSION);
      expect(row.metadataId).toBeTruthy();
      expect(row.metadata?.width).toBe(640);
      expect(row.metadata?.height).toBe(360);
      expect(row.metadata?.size).toBe(uploaded.length);
      if (row.mimeType === 'video/mp4') {
        expect(row.category).toBe(IngredientCategory.VIDEO);
        expect(row.metadata?.duration).toBe(1);
        expect(row.metadata?.fps).toBe(30);
      } else {
        expect(row.mimeType).toBe('image/png');
        expect(row.category).toBe(IngredientCategory.IMAGE);
        expect(
          publicRevision.outputs.find(
            (output) => output.ingredientId === row.id,
          )?.frame,
        ).toBe(0);
      }
    }
    const visibleIds = await libraryIds(fixture, actor);
    for (const id of outputIds) expect(visibleIds).toContain(id);
    expect(
      visibleIds.filter((id) => id !== actor.sourceAssetId).sort(),
    ).toEqual([...outputIds].sort());
    for (const id of outputIds)
      expect(await libraryIds(fixture, other)).not.toContain(id);
    const execution = await fixture.prisma.workflowExecution.findFirstOrThrow({
      where: {
        id: executionBefore.id,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    expect(execution.status).toBe(WorkflowExecutionStatus.COMPLETED);
    expect(execution.workflowVersionId).toBe(executionBefore.workflowVersionId);
    const claims = await fixture.prisma.workflowNodeClaim.findMany({
      where: {
        executionId: execution.id,
        organizationId: actor.organizationId,
      },
    });
    expect(claims).toHaveLength(1);
    expect(claims[0]?.status).toBe('completed');
    expect(fixture.calls.liveClaims.length).toBeGreaterThanOrEqual(2);
    expect(new Set(fixture.calls.liveClaims)).toEqual(
      new Set(claims.map((claim) => claim.id)),
    );
    const settled = await fixture.prisma.creditReservation.findFirstOrThrow({
      where: {
        id: reservation.id,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    expect(settled.status).toBe(CreditReservationStatus.SETTLED);
    expect(settled.settledAmount).toBe(revision.consumedCredits);
    expect(
      z
        .array(z.object({ kind: z.string() }).passthrough())
        .parse(revision.receipts)
        .filter((receipt) => receipt.kind === 'settlement'),
    ).toHaveLength(1);
    expect(revision.consumedCredits).toBeGreaterThan(0);
    expect(revision.consumedCredits).toBeLessThanOrEqual(maximumCredits);
    const wallet = await fixture.credits.getWalletSnapshot(
      actor.organizationId,
    );
    expect(wallet.held).toBe(baseline.held);
    expect(baseline.settled - wallet.settled).toBeCloseTo(
      revision.consumedCredits,
      8,
    );
    const settlements = await fixture.prisma.creditTransaction.findMany({
      where: {
        reservationId: reservation.id,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    expect(settlements).toHaveLength(1);
    expect(settlements[0]?.amount).toBe(revision.consumedCredits);
    expect(fixture.calls.llm).toEqual(['authoring', 'inspection']);
    expect(fixture.calls.rendererSubmissions).toHaveLength(2);
    expect(fixture.calls.uploads).toHaveLength(5);
    const beforeReplay = await persistedSnapshot(fixture, actor);
    const effects = {
      llm: [...fixture.calls.llm],
      render: [...fixture.calls.rendererSubmissions],
      uploads: [...fixture.calls.uploads],
    };
    const replay = projectResponse.parse(
      await fixture.controller.create(
        fixture.request(actor.user),
        actor.user,
        input,
      ),
    );
    expect(replay.data.id).toBe(projectId);
    expect(replay.data.attributes.revisions[0]?.id).toBe(revision.id);
    expect(replay.data.attributes.revisions[0]?.outputs).toEqual(
      publicRevision.outputs,
    );
    await fixture.replayLastWorkflowJob();
    expect(await persistedSnapshot(fixture, actor)).toEqual(beforeReplay);
    expect({
      llm: fixture.calls.llm,
      render: fixture.calls.rendererSubmissions,
      uploads: fixture.calls.uploads,
    }).toEqual(effects);
  });

  it('rejects explicit paid-model quote and create for a free actor before reservation or dispatch', async () => {
    fixture = await createVisualCodeAcceptanceFixture();
    const actor = await seedVisualCodeAcceptanceActor(fixture, { paid: false });
    for (const operation of ['quote', 'create'] as const) {
      const before = await persistedSnapshot(fixture, actor);
      fixture.resetExternalCalls();
      const input = createInput(actor, 100, `free-${operation}`);
      await expect(
        operation === 'quote'
          ? fixture.controller.quote(fixture.request(actor.user), actor.user, {
              operation: 'create',
              input: { ...input },
            })
          : fixture.controller.create(
              fixture.request(actor.user),
              actor.user,
              input,
            ),
      ).rejects.toThrow('visual_model_not_entitled');
      expect(fixture.calls.renderer).toEqual(['GET /health']);
      expect(fixture.calls.routes).toEqual([]);
      expectNoGeneration(fixture);
      expect(await persistedSnapshot(fixture, actor)).toEqual(before);
    }
  });

  it('rejects cross-tenant and same-tenant cross-brand source assets before any external read or hold', async () => {
    fixture = await createVisualCodeAcceptanceFixture();
    const actor = await seedVisualCodeAcceptanceActor(fixture);
    const other = await seedVisualCodeAcceptanceActor(fixture);
    const brandId = generateIdString();
    await fixture.prisma.brand.create({
      data: createTestBrand({
        id: brandId,
        organizationId: actor.organizationId,
        userId: actor.userId,
        slug: `visual-${brandId}`,
      }),
    });
    fixture.seeds.brandIds.push(brandId);
    const source = await fixture.prisma.ingredient.findFirstOrThrow({
      where: {
        id: actor.sourceAssetId,
        organizationId: actor.organizationId,
        isDeleted: false,
      },
    });
    const foreignBrandAsset = await fixture.prisma.ingredient.create({
      data: {
        id: generateIdString(),
        organizationId: actor.organizationId,
        brandId,
        userId: actor.userId,
        metadataId: source.metadataId,
        category: IngredientCategory.IMAGE,
        status: IngredientStatus.GENERATED,
        s3Key: source.s3Key,
        mimeType: source.mimeType,
        fileSize: source.fileSize,
      },
    });
    for (const sourceAssetId of [other.sourceAssetId, foreignBrandAsset.id])
      for (const operation of ['quote', 'create'] as const) {
        const before = await persistedSnapshot(fixture, actor);
        fixture.resetExternalCalls();
        const input = {
          ...createInput(actor, 100, `scope-${operation}-${sourceAssetId}`),
          sourceAssetIds: [sourceAssetId],
        };
        await expect(
          operation === 'quote'
            ? fixture.controller.quote(
                fixture.request(actor.user),
                actor.user,
                { operation: 'create', input: { ...input } },
              )
            : fixture.controller.create(
                fixture.request(actor.user),
                actor.user,
                input,
              ),
        ).rejects.toThrow('visual_source_asset_unavailable');
        expect(fixture.calls.renderer).toEqual([]);
        expect(fixture.calls.routes).toEqual([]);
        expectNoGeneration(fixture);
        expect(await persistedSnapshot(fixture, actor)).toEqual(before);
      }
  });

  it('rejects actual insufficient credits without queued generation, output admission or an active hold', async () => {
    fixture = await createVisualCodeAcceptanceFixture();
    const actor = await seedVisualCodeAcceptanceActor(fixture, {
      credits: false,
    });
    const maximumCredits = await quote(fixture, actor, createInput(actor, 1));
    fixture.resetExternalCalls();
    await expect(
      fixture.controller.create(
        fixture.request(actor.user),
        actor.user,
        createInput(actor, maximumCredits, 'zero-wallet'),
      ),
    ).rejects.toThrow(/Insufficient organization credits/);
    expectNoGeneration(fixture);
    expect(
      [...fixture.queues.values()].every((queue) => queue.jobs.size === 0),
    ).toBe(true);
    expect(
      (await fixture.credits.getWalletSnapshot(actor.organizationId)).held,
    ).toBe(0);
    expect(
      await fixture.prisma.creditReservation.count({
        where: {
          organizationId: actor.organizationId,
          isDeleted: false,
          status: CreditReservationStatus.RESERVED,
        },
      }),
    ).toBe(0);
    expect(
      await fixture.prisma.workflowExecution.count({
        where: { organizationId: actor.organizationId, isDeleted: false },
      }),
    ).toBe(0);
    expect(await libraryIds(fixture, actor)).toEqual([actor.sourceAssetId]);
  });

  it.each([undefined, 'false'])(
    'keeps the renderer unavailable with enabled=%s and creates no generation effects',
    async (enabled) => {
      fixture = await createVisualCodeAcceptanceFixture({
        rendererEnabled: enabled,
      });
      const actor = await seedVisualCodeAcceptanceActor(fixture);
      const before = await persistedSnapshot(fixture, actor);
      fixture.resetExternalCalls();
      const catalog = catalogResponse.parse(
        await fixture.controller.catalog(
          fixture.request(actor.user),
          actor.user,
          actor.brandId,
        ),
      );
      expect(catalog.data.attributes.isAvailable).toBe(false);
      expect(catalog.data.attributes.unavailableReason).toBe(
        'visual_code_renderer_unavailable',
      );
      expectNoGeneration(fixture);
      expect(fixture.calls.renderer).toEqual([]);
      for (const operation of ['quote', 'create'] as const) {
        fixture.resetExternalCalls();
        const input = createInput(actor, 100, `disabled-${operation}`);
        await expect(
          operation === 'quote'
            ? fixture.controller.quote(
                fixture.request(actor.user),
                actor.user,
                { operation: 'create', input: { ...input } },
              )
            : fixture.controller.create(
                fixture.request(actor.user),
                actor.user,
                input,
              ),
        ).rejects.toThrow('visual_code_renderer_unavailable');
        expectNoGeneration(fixture);
        expect(fixture.calls.renderer).toEqual([]);
        expect(fixture.calls.routes).toEqual([]);
        expect(await persistedSnapshot(fixture, actor)).toEqual(before);
      }
    },
  );
});
