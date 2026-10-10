import { readBreakoutBaselineReceipt } from '@api/collections/outliers/services/breakout-baseline-receipt.util';
import {
  registerBreakoutResponse,
  reserveBreakoutOutputPlan,
} from '@api/collections/outliers/services/breakout-response-identity.util';
import { Platform } from '@genfeedai/contracts';
import type {
  BreakoutBaselineReadInput,
  BreakoutBaselineReceiptResult,
  BreakoutOutputPlanInput,
  BreakoutOutputPlanSlot,
} from '@genfeedai/contracts/interfaces';
import type {
  BreakoutResponse,
  BreakoutResponseOutput,
  PostExposureObservation,
  Prisma,
} from '@genfeedai/prisma';

vi.mock(
  '@api/collections/outliers/services/breakout-baseline-receipt.util',
  () => ({ readBreakoutBaselineReceipt: vi.fn() }),
);

const NOW = new Date('2026-10-08T12:00:00Z');
const input: BreakoutBaselineReadInput = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  credentialId: 'credential-a',
  platform: Platform.TWITTER,
  format: 'text',
  targetObservationId: 'observation-a',
  metric: 'impressions',
  nowMs: NOW.getTime(),
  options: {
    windowAgeMs: 3_600_000,
    toleranceMs: 600_000,
    windowSize: 20,
    minimumSampleSize: 5,
    breakoutThreshold: 10,
  },
};
function receipt(): BreakoutBaselineReceiptResult {
  return {
    status: 'recorded',
    receiptId: 'receipt-a',
    evidenceFingerprint: 'evidence-a',
    evaluation: {
      version: 1,
      status: 'breakout',
      metric: input.metric,
      source: 'twitter:post:organic_metrics.impression_count',
      exposureScope: 'organic',
      timeBasis: 'collection_interval',
      targetObservationId: input.targetObservationId,
      targetValue: 1000,
      median: 100,
      ratio: 10,
      sampleSize: 5,
      options: input.options,
      contributors: [],
      exclusions: [],
    },
  };
}
function harness() {
  vi.mocked(readBreakoutBaselineReceipt).mockResolvedValue(receipt());
  const target: PostExposureObservation = {
    id: input.targetObservationId,
    organizationId: input.organizationId,
    brandId: input.brandId,
    credentialId: input.credentialId,
    platform: input.platform,
    format: input.format,
    postId: 'post-a',
    nativeSourcePostId: null,
    externalId: 'tweet-a',
    logicalPostId: 'logical-a',
    publishedAt: new Date(NOW.getTime() - 3_600_000),
    contentDigest: 'content-a',
    publicationFingerprint: 'publication-a',
    sourceAttemptId: 'attempt-a',
    sourceFingerprint: 'observation-fingerprint-a',
    requestStartedAt: new Date(NOW.getTime() - 1000),
    receivedAt: NOW,
    providerAsOf: null,
    exposures: {},
    isPinned: null,
    isPromoted: null,
    isResponse: false,
    isDeleted: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
  let response: BreakoutResponse | null = null;
  const outputs = new Map<number, BreakoutResponseOutput>();
  const findTarget = vi.fn(async () => target);
  const createResponse = vi.fn(
    async ({ data }: { data: Prisma.BreakoutResponseCreateManyInput }) => {
      if (response) return { count: 0 };
      response = {
        id: 'response-a',
        organizationId: data.organizationId,
        brandId: data.brandId,
        credentialId: data.credentialId,
        platform: data.platform,
        externalId: data.externalId,
        logicalPostId: data.logicalPostId,
        sourcePostId: data.sourcePostId ?? null,
        nativeSourcePostId: data.nativeSourcePostId ?? null,
        triggerReceiptId: data.triggerReceiptId,
        publicationFingerprint: data.publicationFingerprint,
        contentDigest: data.contentDigest,
        detectedAt: NOW,
        state: 'detected',
        heldReason: null,
        expiresAt: null,
        outputPlanFingerprint: null,
        isDeleted: false,
        createdAt: NOW,
        updatedAt: NOW,
      };
      return { count: 1 };
    },
  );
  const findResponse = vi.fn(async () =>
    response && !response.isDeleted ? response : null,
  );
  const updateResponse = vi.fn(
    async ({
      data,
    }: {
      data: { state: string; outputPlanFingerprint: string };
    }) => {
      if (!response) return { count: 0 };
      Object.assign(response, data);
      return { count: 1 };
    },
  );
  const createOutputs = vi.fn(
    async ({
      data,
    }: {
      data: Prisma.BreakoutResponseOutputCreateManyInput[];
    }) => {
      let count = 0;
      for (const item of data) {
        if (outputs.has(item.ordinal)) continue;
        outputs.set(item.ordinal, {
          id: `output-${item.ordinal}`,
          organizationId: item.organizationId,
          brandId: item.brandId,
          credentialId: item.credentialId,
          responseId: item.responseId,
          ordinal: item.ordinal,
          kind: item.kind,
          format: item.format,
          generationKey: item.generationKey,
          state: 'reserved',
          heldReason: null,
          workflowExecutionId: null,
          isDeleted: false,
          createdAt: NOW,
          updatedAt: NOW,
        });
        count += 1;
      }
      return { count };
    },
  );
  const findOutputs = vi.fn(async () =>
    [...outputs.values()]
      .filter((item) => !item.isDeleted)
      .sort((left, right) => left.ordinal - right.ordinal),
  );
  const query = vi.fn(async () => []);
  const tx = {
    $queryRaw: query,
    postExposureObservation: { findFirst: findTarget },
    breakoutResponse: {
      createMany: createResponse,
      findFirst: findResponse,
      updateMany: updateResponse,
    },
    breakoutResponseOutput: {
      createMany: createOutputs,
      findMany: findOutputs,
    },
  } as unknown as Prisma.TransactionClient;
  return {
    tx,
    target,
    outputs,
    query,
    createResponse,
    findResponse,
    updateResponse,
    createOutputs,
    findOutputs,
    get response() {
      return response;
    },
  };
}
function plan(slots: BreakoutOutputPlanSlot[]): BreakoutOutputPlanInput {
  return {
    organizationId: input.organizationId,
    brandId: input.brandId,
    credentialId: input.credentialId,
    platform: input.platform,
    responseId: 'response-a',
    slots,
  };
}
const quote: BreakoutOutputPlanSlot = {
  ordinal: 1,
  kind: 'quote',
  format: 'text',
};

describe('durable breakout response and output identity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('converges different observations and exposure metrics on the first source response', async () => {
    const h = harness();
    const first = await registerBreakoutResponse(h.tx, input);
    expect(first).toEqual({
      status: 'registered',
      responseId: 'response-a',
      triggerReceiptId: 'receipt-a',
    });
    const nextReceipt = receipt();
    if (nextReceipt.status !== 'recorded')
      throw new Error('Invalid fixture receipt');
    nextReceipt.receiptId = 'receipt-b';
    nextReceipt.evaluation.targetObservationId = 'observation-b';
    nextReceipt.evaluation.metric = 'views';
    h.target.id = 'observation-b';
    vi.mocked(readBreakoutBaselineReceipt).mockResolvedValue(nextReceipt);
    const second = await registerBreakoutResponse(h.tx, {
      ...input,
      targetObservationId: 'observation-b',
      metric: 'views',
    });
    expect(second).toEqual({ ...first, status: 'replayed' });
    expect(h.response?.triggerReceiptId).toBe('receipt-a');
    expect(h.createResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: input.organizationId,
          credentialId: input.credentialId,
          platform: Platform.TWITTER,
          externalId: 'tweet-a',
          sourcePostId: 'post-a',
        }),
        skipDuplicates: true,
      }),
    );
  });

  it('retains native source identity without fabricating a published Post', async () => {
    const h = harness();
    h.target.postId = null;
    h.target.nativeSourcePostId = 'native-a';
    expect(await registerBreakoutResponse(h.tx, input)).toMatchObject({
      status: 'registered',
    });
    expect(await registerBreakoutResponse(h.tx, input)).toMatchObject({
      status: 'replayed',
    });
    expect(h.createResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourcePostId: null,
          nativeSourcePostId: 'native-a',
        }),
      }),
    );
    h.target.postId = 'post-a';
    expect(await registerBreakoutResponse(h.tx, input)).toEqual({
      status: 'invalid_observation',
    });
  });

  it('cannot register when current evidence is held', async () => {
    const h = harness();
    vi.mocked(readBreakoutBaselineReceipt).mockResolvedValue({
      status: 'source_changed',
    });
    expect(await registerBreakoutResponse(h.tx, input)).toEqual({
      status: 'source_changed',
    });
    expect(h.createResponse).not.toHaveBeenCalled();
  });

  it('withholds below-threshold evidence rather than create an identity', async () => {
    const h = harness();
    const value = receipt();
    if (value.status !== 'recorded') throw new Error('Invalid fixture receipt');
    value.evaluation.status = 'below_threshold';
    vi.mocked(readBreakoutBaselineReceipt).mockResolvedValue(value);
    expect(await registerBreakoutResponse(h.tx, input)).toEqual({
      status: 'evidence_held',
      reason: 'below_threshold',
    });
    expect(h.createResponse).not.toHaveBeenCalled();
  });

  it('cannot create a response chain from a generated response', async () => {
    const h = harness();
    h.target.isResponse = true;
    expect(await registerBreakoutResponse(h.tx, input)).toEqual({
      status: 'evidence_held',
      reason: 'response_source',
    });
    expect(h.createResponse).not.toHaveBeenCalled();
  });

  it('holds changed publication material without creating another source identity', async () => {
    const h = harness();
    await registerBreakoutResponse(h.tx, input);
    h.target.publicationFingerprint = 'edited-publication';
    expect(await registerBreakoutResponse(h.tx, input)).toEqual({
      status: 'identity_conflict',
    });
    expect(h.response?.publicationFingerprint).toBe('publication-a');
  });

  it('does not revive a deleted response identity', async () => {
    const h = harness();
    await registerBreakoutResponse(h.tx, input);
    if (!h.response) throw new Error('Missing fixture response');
    h.response.isDeleted = true;
    expect(await registerBreakoutResponse(h.tx, input)).toEqual({
      status: 'identity_conflict',
    });
  });

  it('counts an X quote inside the same five reserved outputs and retains stable generation keys', async () => {
    const h = harness();
    await registerBreakoutResponse(h.tx, input);
    const request = plan([
      quote,
      ...(['image', 'carousel', 'video', 'short'] as const).map(
        (format, index) => ({
          ordinal: index + 2,
          kind: 'follow_up' as const,
          format,
        }),
      ),
    ]);
    const first = await reserveBreakoutOutputPlan(h.tx, request);
    expect(first).toMatchObject({
      status: 'reserved',
      outputIds: ['output-1', 'output-2', 'output-3', 'output-4', 'output-5'],
    });
    expect(h.outputs.get(1)).toMatchObject({
      kind: 'quote',
      ordinal: 1,
      format: 'text',
      state: 'reserved',
    });
    expect(h.outputs.size).toBe(5);
    expect(await reserveBreakoutOutputPlan(h.tx, request)).toEqual({
      ...first,
      status: 'replayed',
    });
    expect(h.createOutputs).toHaveBeenCalledTimes(1);
    expect(h.response?.state).toBe('planned');
  });

  it.each(['text', 'image', 'carousel', 'video', 'short', 'thread'] as const)(
    'supports a %s output identity without claiming provider generation',
    async (format) => {
      const h = harness();
      await registerBreakoutResponse(h.tx, input);
      expect(
        await reserveBreakoutOutputPlan(
          h.tx,
          plan([{ ordinal: 1, kind: 'follow_up', format }]),
        ),
      ).toMatchObject({ status: 'reserved' });
      expect(h.outputs.get(1)).toMatchObject({
        format,
        state: 'reserved',
        workflowExecutionId: null,
      });
    },
  );

  it('withholds a changed output plan before any second reservation', async () => {
    const h = harness();
    await registerBreakoutResponse(h.tx, input);
    await reserveBreakoutOutputPlan(h.tx, plan([quote]));
    expect(
      await reserveBreakoutOutputPlan(
        h.tx,
        plan([quote, { ordinal: 2, kind: 'follow_up', format: 'image' }]),
      ),
    ).toEqual({ status: 'plan_conflict' });
    expect(h.outputs.size).toBe(1);
    expect(h.createOutputs).toHaveBeenCalledTimes(1);
  });

  // Each case is one slots array; wrap it so it is not spread into arguments.
  it.each(
    [
      [],
      Array.from({ length: 6 }, (_, index) => ({
        ordinal: index + 1,
        kind: 'follow_up' as const,
        format: 'text' as const,
      })),
      [{ ...quote, ordinal: 2 }],
      [{ ...quote, format: 'image' as const }],
      [quote, { ...quote, ordinal: 2 }],
      [
        quote,
        { ordinal: 3, kind: 'follow_up' as const, format: 'text' as const },
      ],
    ].map((slots) => [slots]),
  )('rejects invalid or over-cap output plan %#', async (slots) => {
    const h = harness();
    expect(await reserveBreakoutOutputPlan(h.tx, plan(slots))).toEqual({
      status: 'invalid_plan',
    });
    expect(h.query).not.toHaveBeenCalled();
    expect(h.createOutputs).not.toHaveBeenCalled();
  });

  it('does not create an X quote through another platform account', async () => {
    const h = harness();
    expect(
      await reserveBreakoutOutputPlan(h.tx, {
        ...plan([quote]),
        platform: Platform.INSTAGRAM,
      }),
    ).toEqual({ status: 'invalid_plan' });
    expect(h.createOutputs).not.toHaveBeenCalled();
  });

  it('cannot reserve outputs without a current scoped response', async () => {
    const h = harness();
    expect(await reserveBreakoutOutputPlan(h.tx, plan([quote]))).toEqual({
      status: 'missing_response',
    });
    expect(h.createOutputs).not.toHaveBeenCalled();
  });

  it('does not recycle a deleted output slot', async () => {
    const h = harness();
    await registerBreakoutResponse(h.tx, input);
    await reserveBreakoutOutputPlan(h.tx, plan([quote]));
    const first = h.outputs.get(1);
    if (!first) throw new Error('Missing fixture output');
    first.isDeleted = true;
    expect(await reserveBreakoutOutputPlan(h.tx, plan([quote]))).toEqual({
      status: 'plan_conflict',
    });
    expect(h.createOutputs).toHaveBeenCalledTimes(1);
    expect(first.isDeleted).toBe(true);
  });

  it('throws on an unexpected insert conflict so a partial plan must roll back', async () => {
    const h = harness();
    await registerBreakoutResponse(h.tx, input);
    h.createOutputs.mockResolvedValueOnce({ count: 0 });
    await expect(
      reserveBreakoutOutputPlan(h.tx, plan([quote])),
    ).rejects.toThrow('roll back transaction');
    expect(h.updateResponse).not.toHaveBeenCalled();
  });

  it('does not reserve new outputs on a suppressed response', async () => {
    const h = harness();
    await registerBreakoutResponse(h.tx, input);
    if (!h.response) throw new Error('Missing fixture response');
    h.response.state = 'suppressed';
    expect(await reserveBreakoutOutputPlan(h.tx, plan([quote]))).toEqual({
      status: 'plan_conflict',
    });
    expect(h.createOutputs).not.toHaveBeenCalled();
  });
});
