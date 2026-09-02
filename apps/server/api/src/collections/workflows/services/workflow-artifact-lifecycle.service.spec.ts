import {
  WORKFLOW_ARTIFACT_BACKSTOP_MS,
  WorkflowArtifactLifecycleService,
} from '@api/collections/workflows/services/workflow-artifact-lifecycle.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
