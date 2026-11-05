import {
  applyMediaOutcomes,
  classifyMediaOutput,
  MEDIA_RENDER_FAILED_REASON,
  readIngredientOutputIds,
  settleAgentTransferFromExecution,
  settleAgentTransferMediaOutput,
} from '@api/collections/agent-transfers/services/agent-transfer-settlement.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentTransferStatus,
  CreditReservationStatus,
  IngredientStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const ORG = 'org-1';

function ingredientRef(recordId: string) {
  return {
    kind: 'ingredient',
    organizationId: ORG,
    recordId,
    serializer: 'ingredient',
  };
}

const POST_REF = {
  kind: 'post',
  organizationId: ORG,
  recordId: 'post-1',
  serializer: 'post',
};

describe('classifyMediaOutput', () => {
  it.each([
    [IngredientStatus.GENERATED, undefined, undefined, 'done'],
    [IngredientStatus.VALIDATED, undefined, undefined, 'done'],
    [IngredientStatus.FAILED, undefined, undefined, 'failed'],
    [IngredientStatus.REJECTED, undefined, 'settled', 'failed'],
    [IngredientStatus.GENERATED, undefined, 'released', 'done'],
    [IngredientStatus.PROCESSING, undefined, undefined, 'pending'],
    [IngredientStatus.PROCESSING, undefined, 'released', 'failed'],
    [IngredientStatus.PROCESSING, undefined, 'settled', 'done'],
    [
      IngredientStatus.PROCESSING,
      CreditReservationStatus.RELEASED,
      undefined,
      'failed',
    ],
    [
      IngredientStatus.PROCESSING,
      CreditReservationStatus.EXPIRED,
      undefined,
      'failed',
    ],
    [
      IngredientStatus.PROCESSING,
      CreditReservationStatus.SETTLED,
      undefined,
      'done',
    ],
    [
      IngredientStatus.PROCESSING,
      CreditReservationStatus.RESERVED,
      undefined,
      'pending',
    ],
    [undefined, undefined, undefined, 'failed'],
  ] as const)(
    'reads %s (hold %s, signal %s) as %s',
    (ingredientStatus, reservationStatus, signal, expected) => {
      expect(
        classifyMediaOutput({ ingredientStatus, reservationStatus, signal }),
      ).toBe(expected);
    },
  );
});

describe('readIngredientOutputIds', () => {
  it('lists each ingredient output once and skips other records', () => {
    expect(
      readIngredientOutputIds([
        ingredientRef('image-1'),
        POST_REF,
        ingredientRef('image-1'),
        ingredientRef('video-1'),
        { kind: 'ingredient' },
      ]),
    ).toEqual(['image-1', 'video-1']);
  });
});

describe('applyMediaOutcomes', () => {
  it('drops a failed render and keeps the rest', () => {
    expect(
      applyMediaOutcomes({
        failedIngredientIds: new Set(['video-1']),
        failureReason: null,
        outputs: [ingredientRef('image-1'), ingredientRef('video-1')],
        status: AgentTransferStatus.COMPLETED,
      }),
    ).toEqual({
      failureReason: null,
      outputs: [ingredientRef('image-1')],
      status: AgentTransferStatus.COMPLETED,
    });
  });

  it('fails a child whose every output failed to render', () => {
    expect(
      applyMediaOutcomes({
        failedIngredientIds: new Set(['video-1']),
        failureReason: null,
        outputs: [ingredientRef('video-1')],
        status: AgentTransferStatus.COMPLETED,
      }),
    ).toEqual({
      failureReason: MEDIA_RENDER_FAILED_REASON,
      outputs: [],
      status: AgentTransferStatus.FAILED,
    });
  });

  it('keeps a child that produced no outputs completed', () => {
    expect(
      applyMediaOutcomes({
        failedIngredientIds: new Set(),
        failureReason: null,
        outputs: [],
        status: AgentTransferStatus.COMPLETED,
      }),
    ).toEqual({
      failureReason: null,
      outputs: [],
      status: AgentTransferStatus.COMPLETED,
    });
  });
});

interface FakeTransfer {
  completedAt: Date | null;
  completionSummary: string | null;
  destinationExecutionId: string;
  destinationThreadId: string;
  failureReason: string | null;
  id: string;
  organizationId: string;
  outputArtifactReferences: unknown[];
  status: AgentTransferStatus;
}

interface FakeMessage {
  content: string;
  metadata: { agentTransferResult: Record<string, unknown> };
  threadId: string;
}

/**
 * A stateful stand-in for the rows settlement reads and writes, so the specs
 * assert the transfer and the master's note rather than the calls made.
 */
function createStore(input: {
  executionStatus?: WorkflowExecutionStatus;
  ingredients: Record<string, IngredientStatus>;
}) {
  const transfer: FakeTransfer = {
    completedAt: null,
    completionSummary: null,
    destinationExecutionId: 'execution-1',
    destinationThreadId: 'thread-video',
    failureReason: null,
    id: 'transfer-1',
    organizationId: ORG,
    outputArtifactReferences: [],
    status: AgentTransferStatus.QUEUED,
  };
  const ingredients = { ...input.ingredients };
  const messages: FakeMessage[] = [];

  const prisma = {
    agentMessage: {
      create: async ({ data }: { data: FakeMessage }) => {
        messages.push(data);
        return data;
      },
    },
    agentTransfer: {
      findFirst: async () => ({
        ...transfer,
        destinationThread: { title: 'Hero video' },
        sourceBrandId: 'brand-1',
        sourceThreadId: 'thread-master',
        userId: 'user-1',
      }),
      findMany: async ({
        where,
      }: {
        where: {
          outputArtifactReferences: {
            array_contains: Array<{ recordId: string }>;
          };
          status: AgentTransferStatus;
        };
      }) => {
        const wanted = where.outputArtifactReferences.array_contains[0];
        const listed = transfer.outputArtifactReferences.some(
          (item) => (item as { recordId: string }).recordId === wanted.recordId,
        );
        return transfer.status === where.status && listed ? [transfer] : [];
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: Partial<FakeTransfer>;
        where: { status: { in: AgentTransferStatus[] } };
      }) => {
        if (!where.status.in.includes(transfer.status)) {
          return { count: 0 };
        }
        Object.assign(transfer, data);
        return { count: 1 };
      },
    },
    creditReservation: { findMany: async () => [] },
    ingredient: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.flatMap((id) =>
          ingredients[id] ? [{ id, status: ingredients[id] }] : [],
        ),
    },
    workflowExecution: {
      findFirst: async () => ({
        status: input.executionStatus ?? WorkflowExecutionStatus.COMPLETED,
      }),
    },
  } as unknown as PrismaService;

  return { ingredients, messages, prisma, transfer };
}

function completedExecution(outputs: unknown[]) {
  return {
    completedAt: new Date('2026-11-05T10:00:00Z'),
    error: null,
    id: 'execution-1',
    progress: 100,
    result: { artifactReferences: outputs, summary: 'Made a 9:16 video.' },
    startedAt: new Date('2026-11-05T09:58:00Z'),
    status: WorkflowExecutionStatus.COMPLETED,
  };
}

describe('settling a hand-off whose media is still rendering', () => {
  it('waits for the render, then reports the video to the master', async () => {
    const store = createStore({
      ingredients: { 'video-1': IngredientStatus.PROCESSING },
    });

    await settleAgentTransferFromExecution(store.prisma, {
      execution: completedExecution([ingredientRef('video-1')]),
      organizationId: ORG,
      transferId: 'transfer-1',
    });
    expect(store.transfer.status).toBe(AgentTransferStatus.RUNNING);
    expect(store.messages).toEqual([]);

    store.ingredients['video-1'] = IngredientStatus.GENERATED;
    await settleAgentTransferMediaOutput(store.prisma, {
      ingredientId: 'video-1',
      organizationId: ORG,
      outcome: 'settled',
    });

    expect(store.transfer.status).toBe(AgentTransferStatus.COMPLETED);
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].threadId).toBe('thread-master');
    expect(store.messages[0].metadata.agentTransferResult).toMatchObject({
      outputArtifactReferences: [ingredientRef('video-1')],
      status: AgentTransferStatus.COMPLETED,
    });
  });

  it('reports a failed render as a failure with no output to pass on', async () => {
    const store = createStore({
      ingredients: { 'video-1': IngredientStatus.PROCESSING },
    });

    await settleAgentTransferFromExecution(store.prisma, {
      execution: completedExecution([ingredientRef('video-1')]),
      organizationId: ORG,
      transferId: 'transfer-1',
    });
    // The release lands before the ingredient's failure is saved.
    await settleAgentTransferMediaOutput(store.prisma, {
      ingredientId: 'video-1',
      organizationId: ORG,
      outcome: 'released',
    });

    expect(store.transfer).toMatchObject({
      failureReason: MEDIA_RENDER_FAILED_REASON,
      outputArtifactReferences: [],
      status: AgentTransferStatus.FAILED,
    });
    expect(store.messages[0].content).toBe(
      `Hero video failed: ${MEDIA_RENDER_FAILED_REASON}`,
    );
  });

  it('waits for every render, not just the first one to end', async () => {
    const store = createStore({
      ingredients: {
        'image-1': IngredientStatus.PROCESSING,
        'video-1': IngredientStatus.PROCESSING,
      },
    });

    await settleAgentTransferFromExecution(store.prisma, {
      execution: completedExecution([
        ingredientRef('image-1'),
        ingredientRef('video-1'),
      ]),
      organizationId: ORG,
      transferId: 'transfer-1',
    });
    await settleAgentTransferMediaOutput(store.prisma, {
      ingredientId: 'image-1',
      organizationId: ORG,
      outcome: 'settled',
    });
    expect(store.transfer.status).toBe(AgentTransferStatus.RUNNING);

    store.ingredients['image-1'] = IngredientStatus.GENERATED;
    await settleAgentTransferMediaOutput(store.prisma, {
      ingredientId: 'video-1',
      organizationId: ORG,
      outcome: 'released',
    });

    expect(store.transfer).toMatchObject({
      outputArtifactReferences: [ingredientRef('image-1')],
      status: AgentTransferStatus.COMPLETED,
    });
    expect(store.messages).toHaveLength(1);
  });

  it('reports at once when the media had already rendered', async () => {
    const store = createStore({
      ingredients: { 'video-1': IngredientStatus.GENERATED },
    });

    await settleAgentTransferFromExecution(store.prisma, {
      execution: completedExecution([ingredientRef('video-1'), POST_REF]),
      organizationId: ORG,
      transferId: 'transfer-1',
    });

    expect(store.transfer).toMatchObject({
      outputArtifactReferences: [ingredientRef('video-1'), POST_REF],
      status: AgentTransferStatus.COMPLETED,
    });
    expect(store.messages).toHaveLength(1);
  });

  it('leaves a render alone when the child is still running', async () => {
    const store = createStore({
      executionStatus: WorkflowExecutionStatus.RUNNING,
      ingredients: { 'video-1': IngredientStatus.PROCESSING },
    });
    store.transfer.status = AgentTransferStatus.RUNNING;
    store.transfer.outputArtifactReferences = [ingredientRef('video-1')];

    expect(
      await settleAgentTransferMediaOutput(store.prisma, {
        ingredientId: 'video-1',
        organizationId: ORG,
        outcome: 'settled',
      }),
    ).toBe(0);
    expect(store.transfer.status).toBe(AgentTransferStatus.RUNNING);
    expect(store.messages).toEqual([]);
  });
});
