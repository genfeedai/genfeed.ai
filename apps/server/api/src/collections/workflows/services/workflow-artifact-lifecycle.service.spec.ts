import {
  WORKFLOW_ARTIFACT_BACKSTOP_MS,
  WorkflowArtifactLifecycleService,
} from '@api/collections/workflows/services/workflow-artifact-lifecycle.service';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { Prisma } from '@genfeedai/prisma';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function admissionSource() {
  const body = {
    version: 1,
    state: 'available',
    preparationVersion: 1,
    requestHash: 'a'.repeat(64),
    organizationId: 'org-1',
    actorUserId: 'user-1',
    workflowId: 'workflow-1',
    workflowVersionId: 'version-1',
    workflowVersionContentHash: `sha256:v1:${'b'.repeat(64)}`,
    brandId: null,
    trigger: {
      type: 'manual',
      platform: 'internal',
      data: { prompt: 'private' },
    },
    selection: { mode: 'full', respectLocks: true },
    workflow: {
      id: 'workflow-1',
      versionId: 'version-1',
      organizationId: 'org-1',
      userId: 'user-1',
      nodes: [
        {
          id: 'media',
          type: 'genfeedAction',
          label: 'Image',
          config: { actionId: 'imageGen' },
          inputs: [],
        },
      ],
      edges: [],
      lockedNodeIds: [],
    },
    selectedNodeIds: ['media'],
    initialNodeOutputs: {},
    initiallyCompletedNodeIds: [],
  };
  return { ...body, sourceHash: quoteSnapshotHash(body) };
}
function tombstone(source: ReturnType<typeof admissionSource>) {
  return {
    version: 1,
    state: 'redacted',
    reason: 'execution-payload-retention',
    requestHash: source.requestHash,
    sourceHash: source.sourceHash,
  };
}

describe('WorkflowArtifactLifecycleService', () => {
  const workflowArtifact = {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  };
  const workflowExecution = {
    deleteMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const workflowExecutionNodeResult = { updateMany: vi.fn() };
  const prisma = {
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
    workflowArtifact,
    workflowExecution,
    workflowExecutionNodeResult,
  };
  const filesClient = { deleteStoredObject: vi.fn() };
  const logger = { error: vi.fn(), log: vi.fn() };
  const runner = { registerAction: vi.fn(), registerWorkflow: vi.fn() };
  const workflowQueue = { queueSystemWorkflow: vi.fn() };

  let service: WorkflowArtifactLifecycleService;

  beforeEach(() => {
    vi.clearAllMocks();
    workflowExecution.findFirst.mockResolvedValue({ id: 'execution-1' });
    workflowArtifact.upsert.mockResolvedValue({
      expiresAt: new Date(Date.now() + WORKFLOW_ARTIFACT_BACKSTOP_MS),
      id: 'artifact-1',
      state: 'ACTIVE',
    });
    service = new WorkflowArtifactLifecycleService(
      prisma as never,
      filesClient as never,
      logger as never,
      runner as never,
      workflowQueue as never,
    );
  });

  afterEach(() => vi.useRealTimers());

  it('registers immutable trusted metadata with terminal retention by default', async () => {
    await service.register({
      executionId: 'execution-1',
      kind: 'audio',
      metadata: {
        ignored: 'not persisted',
        resolvedUrl: 'https://cdn.example/audio.mp3',
        sourceTitle: 'A'.repeat(700),
        videoId: 'video-1',
        youtubeUrl: 'https://youtube.com/watch?v=video-1',
      },
      nodeId: 'extract-audio',
      organizationId: 'org-1',
      storageKey: 'audio/execution-1.mp3',
    });

    expect(workflowArtifact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          metadata: {
            resolvedUrl: 'https://cdn.example/audio.mp3',
            sourceTitle: 'A'.repeat(500),
            videoId: 'video-1',
            youtubeUrl: 'https://youtube.com/watch?v=video-1',
          },
          retentionPolicy: 'terminal',
        }),
        update: {},
      }),
    );
  });

  it('deletes terminal intermediates but leaves TTL source media untouched', async () => {
    workflowArtifact.findMany.mockResolvedValue([
      {
        id: 'artifact-audio',
        storageKey: 'audio/execution-1.mp3',
        storageProvider: 'primary',
      },
    ]);
    workflowArtifact.updateMany.mockResolvedValue({ count: 1 });
    filesClient.deleteStoredObject.mockResolvedValue(undefined);

    await expect(
      service.cleanupExecution({
        executionId: 'execution-1',
        organizationId: 'org-1',
        reason: 'terminal',
      }),
    ).resolves.toEqual({ deleted: 1, failed: 0, skipped: 0 });

    expect(workflowArtifact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ retentionPolicy: 'terminal' }),
      }),
    );
    expect(filesClient.deleteStoredObject).toHaveBeenCalledWith(
      'audio/execution-1.mp3',
    );
    expect(workflowArtifact.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          cleanupClaimedAt: null,
          isDeleted: true,
          lastError: null,
          state: 'DELETED',
        },
      }),
    );
  });

  it('scrubs selected node payloads and preserves only execution metadata', async () => {
    workflowExecution.findFirst.mockResolvedValue({
      payloadScrubbedAt: null,
      purgeAfterHours: null,
      result: {
        inputValues: { transcript: 'large' },
        metadata: { origin: 'ui' },
      },
      scrubAllNodePayloads: false,
      scrubNodeIds: ['transcribe-audio'],
    });
    workflowExecutionNodeResult.updateMany.mockResolvedValue({ count: 1 });
    workflowExecution.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.applyTerminalRetention({
        executionId: 'execution-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).resolves.toBe(true);

    expect(workflowExecutionNodeResult.updateMany).toHaveBeenCalledWith({
      data: { input: { scrubbed: true }, output: { scrubbed: true } },
      where: {
        executionId: 'execution-1',
        nodeId: { in: ['transcribe-audio'] },
        organizationId: 'org-1',
      },
    });
    expect(workflowExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          result: expect.objectContaining({
            metadata: { origin: 'ui' },
            scrubbed: true,
          }),
        }),
      }),
    );
  });

  it('redacts the entire available source during a selective node scrub in the same transaction', async () => {
    const source = admissionSource();
    workflowExecution.findFirst.mockResolvedValue({
      generationAdmissionSource: source,
      payloadScrubbedAt: null,
      purgeAfterHours: 4,
      result: {
        inputValues: { prompt: 'private' },
        metadata: { origin: 'ui' },
        nodeResults: ['private'],
      },
      scrubAllNodePayloads: false,
      scrubNodeIds: ['media'],
    });
    workflowExecutionNodeResult.updateMany.mockResolvedValue({ count: 1 });
    workflowExecution.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.applyTerminalRetention({
        executionId: 'execution-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).resolves.toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.any(Promise),
      expect.any(Promise),
    ]);
    expect(workflowExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationAdmissionSource: tombstone(source),
          purgeAt: null,
          result: expect.objectContaining({
            metadata: { origin: 'ui' },
            scrubbed: true,
          }),
        }),
        where: expect.objectContaining({
          organizationId: 'org-1',
          isDeleted: false,
          payloadScrubbedAt: null,
        }),
      }),
    );
    expect(source.state).toBe('available');
  });
  it('preserves full-scrub purge duration without retaining raw source', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-09-30T12:00:00Z');
    vi.setSystemTime(now);
    workflowExecution.findFirst.mockResolvedValue({
      generationAdmissionSource: admissionSource(),
      payloadScrubbedAt: null,
      purgeAfterHours: 4,
      result: {},
      scrubAllNodePayloads: true,
      scrubNodeIds: [],
    });
    workflowExecutionNodeResult.updateMany.mockResolvedValue({ count: 2 });
    workflowExecution.updateMany.mockResolvedValue({ count: 1 });
    await service.applyTerminalRetention({
      executionId: 'execution-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(workflowExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payloadScrubbedAt: now,
          purgeAt: new Date('2026-09-30T16:00:00Z'),
        }),
      }),
    );
    expect(workflowExecutionNodeResult.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { executionId: 'execution-1', organizationId: 'org-1' },
      }),
    );
  });
  it('repairs an already-scrubbed source without rewriting payloads, timestamps or purge timing', async () => {
    const source = admissionSource();
    const scrubbedAt = new Date('2026-09-29T12:00:00Z');
    workflowExecution.findFirst.mockResolvedValue({
      generationAdmissionSource: source,
      payloadScrubbedAt: scrubbedAt,
      purgeAfterHours: 4,
      result: { scrubbed: true },
      scrubAllNodePayloads: true,
      scrubNodeIds: [],
    });
    workflowExecution.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.applyTerminalRetention({
        executionId: 'execution-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).resolves.toBe(true);
    expect(workflowExecutionNodeResult.updateMany).not.toHaveBeenCalled();
    expect(workflowExecution.updateMany).toHaveBeenCalledWith({
      data: { generationAdmissionSource: tombstone(source) },
      where: {
        id: 'execution-1',
        organizationId: 'org-1',
        isDeleted: false,
        payloadScrubbedAt: scrubbedAt,
      },
    });
  });
  it('leaves an already-redacted source and timestamps unchanged on replay', async () => {
    workflowExecution.findFirst.mockResolvedValue({
      generationAdmissionSource: tombstone(admissionSource()),
      payloadScrubbedAt: new Date('2026-09-29T12:00:00Z'),
      scrubAllNodePayloads: true,
      scrubNodeIds: [],
    });
    await expect(
      service.applyTerminalRetention({
        executionId: 'execution-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).resolves.toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(workflowExecution.updateMany).not.toHaveBeenCalled();
  });
  it.each([null, new Date('2026-09-29T12:00:00Z')])(
    'clears malformed raw source to database NULL during scrub/repair (%s)',
    async (payloadScrubbedAt) => {
      workflowExecution.findFirst.mockResolvedValue({
        generationAdmissionSource: {
          state: 'redacted',
          privatePrompt: 'must disappear',
        },
        payloadScrubbedAt,
        purgeAfterHours: null,
        result: {},
        scrubAllNodePayloads: true,
        scrubNodeIds: [],
      });
      workflowExecutionNodeResult.updateMany.mockResolvedValue({ count: 1 });
      workflowExecution.updateMany.mockResolvedValue({ count: 1 });
      await expect(
        service.applyTerminalRetention({
          executionId: 'execution-1',
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      ).resolves.toBe(true);
      expect(workflowExecution.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generationAdmissionSource: Prisma.DbNull,
          }),
        }),
      );
    },
  );
  it('retains source when no existing payload scrub policy applies', async () => {
    workflowExecution.findFirst.mockResolvedValue({
      generationAdmissionSource: admissionSource(),
      payloadScrubbedAt: null,
      scrubAllNodePayloads: false,
      scrubNodeIds: [],
    });
    await expect(
      service.applyTerminalRetention({
        executionId: 'execution-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).resolves.toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('discovers already-scrubbed available sources for repair without a new timer', async () => {
    workflowArtifact.findMany.mockResolvedValue([]);
    workflowExecution.findMany.mockResolvedValue([]);
    await service.findExpiredExecutionScopes(new Date('2026-09-30T12:00:00Z'));
    expect(workflowExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              payloadScrubbedAt: { not: null },
              generationAdmissionSource: {
                path: ['state'],
                equals: 'available',
              },
            },
          ]),
        }),
      }),
    );
    expect(workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
  });
  it('does not reset retention timestamps when another scrub won the update', async () => {
    workflowExecution.findFirst.mockResolvedValue({
      generationAdmissionSource: admissionSource(),
      payloadScrubbedAt: null,
      purgeAfterHours: 4,
      result: {},
      scrubAllNodePayloads: true,
      scrubNodeIds: [],
    });
    workflowExecutionNodeResult.updateMany.mockResolvedValue({ count: 1 });
    workflowExecution.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.applyTerminalRetention({
        executionId: 'execution-1',
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    ).resolves.toBe(false);
    expect(workflowExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ payloadScrubbedAt: null }),
      }),
    );
  });

  it('rejects promotion after the 24-hour window', async () => {
    workflowArtifact.findFirst.mockResolvedValue({
      expiresAt: new Date('2026-08-28T00:00:00.000Z'),
      id: 'artifact-1',
      promotionTargetId: null,
      promotionTargetType: null,
      state: 'ACTIVE',
    });

    await expect(
      service.markPromoted({
        artifactId: 'artifact-1',
        organizationId: 'org-1',
        targetId: 'asset-1',
        targetType: 'asset',
        userId: 'user-1',
      }),
    ).rejects.toThrow('promotion window has expired');
  });
});
