import { ClipContinuityFinalizationService } from '@api/services/clip-orchestrator/clip-continuity-finalization.service';
import type { ClipRun } from '@server/services/clip-orchestrator/clip-orchestrator.service';
import { ClipRunState } from '@server/services/clip-orchestrator/clip-run-state.enum';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const run: ClipRun = {
  confirmationRequired: true,
  createdAt: new Date('2026-08-26T10:00:00.000Z'),
  currentState: ClipRunState.Generating,
  id: 'run-1',
  metadata: {
    hookApproval: {
      phase: 'approved',
      remainingInput: { highlights: [{ title: 'body' }] },
    },
  },
  organizationId: 'org-1',
  projectId: 'project-1',
  runReferences: [
    {
      assetId: 'face-1',
      role: 'character',
      url: 'https://cdn.example/face.png',
    } as never,
  ],
  skipMerging: false,
  steps: [],
  updatedAt: new Date('2026-08-26T10:00:00.000Z'),
  userId: 'user-1',
};

const clips = [
  {
    captionedVideoUrl: 'https://cdn.example/clip-1.mp4',
    createdAt: new Date('2026-08-26T10:01:00.000Z'),
    id: 'clip-1',
    index: 0,
    status: 'completed',
  },
  {
    captionedVideoUrl: 'https://cdn.example/clip-2.mp4',
    createdAt: new Date('2026-08-26T10:02:00.000Z'),
    id: 'clip-2',
    index: 1,
    status: 'completed',
  },
];

describe('ClipContinuityFinalizationService', () => {
  const orchestrator = {
    getRun: vi.fn(),
    updateMetadata: vi.fn(),
  };
  const stateStore = {
    addMember: vi.fn(),
    claim: vi.fn(),
    getMembers: vi.fn(),
    removeMember: vi.fn(),
  };
  const observer = { emitStepProgress: vi.fn() };
  const clipResults = { findByProject: vi.fn() };
  const filesClient = { inspectVideoQa: vi.fn() };
  const llmDispatcher = { chatCompletion: vi.fn() };
  const organizationSetting = { findUnique: vi.fn() };
  const model = { findMany: vi.fn() };
  const task = { findMany: vi.fn(), updateMany: vi.fn() };
  const batchItem = { findMany: vi.fn(), updateMany: vi.fn() };
  const logger = { error: vi.fn() };

  let service: ClipContinuityFinalizationService;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator.getRun.mockResolvedValue(run);
    orchestrator.updateMetadata.mockResolvedValue(run);
    stateStore.claim.mockResolvedValue(true);
    clipResults.findByProject.mockResolvedValue(clips);
    organizationSetting.findUnique.mockResolvedValue({
      defaultModel: undefined,
      enabledModelIds: [],
    });
    model.findMany.mockResolvedValue([]);
    task.findMany.mockResolvedValue([]);
    batchItem.findMany.mockResolvedValue([]);
    service = new ClipContinuityFinalizationService(
      orchestrator as never,
      stateStore as never,
      observer as never,
      clipResults as never,
      filesClient as never,
      llmDispatcher as never,
      { batchItem, model, organizationSetting, task } as never,
      logger as never,
    );
  });

  it('persists an observable non-blocking skip when no vision model is configured', async () => {
    await service.processRun(run.id);

    expect(orchestrator.updateMetadata).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({
        continuityQa: expect.objectContaining({
          skipReason: 'vision_model_unavailable',
          status: 'skipped',
        }),
      }),
    );
    expect(filesClient.inspectVideoQa).not.toHaveBeenCalled();
    expect(llmDispatcher.chatCompletion).not.toHaveBeenCalled();
    expect(observer.emitStepProgress).toHaveBeenLastCalledWith(
      run.id,
      'continuity-qa',
      'skipped',
      expect.any(Object),
    );
  });

  it('records one extraction failure and still assesses the other clip', async () => {
    organizationSetting.findUnique.mockResolvedValue({
      defaultModel: 'local/vision-model',
      enabledModelIds: ['model-1'],
    });
    model.findMany.mockResolvedValue([
      {
        capabilities: ['vision'],
        description: 'Vision model',
        id: 'model-1',
        key: 'local/vision-model',
        recommendedFor: [],
        supportsFeatures: [],
      },
    ]);
    filesClient.inspectVideoQa
      .mockRejectedValueOnce(new Error('corrupt clip'))
      .mockResolvedValueOnce({
        contactSheetUrl: 'https://cdn.example/clip-2-sheet.png',
      });
    llmDispatcher.chatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              character: {
                confidence: 0.95,
                summary: 'Same character.',
                verdict: 'consistent',
              },
              outfit: {
                confidence: 0.9,
                summary: 'Same outfit.',
                verdict: 'consistent',
              },
              product: {
                confidence: null,
                summary: 'Not visible.',
                verdict: 'not_assessed',
              },
            }),
          },
        },
      ],
    });
    task.findMany.mockResolvedValue([
      { decomposition: { steps: 2 }, id: 'task-1' },
    ]);
    batchItem.findMany.mockResolvedValue([
      { data: { clipProjectId: run.projectId }, id: 'batch-item-1' },
    ]);

    await service.processRun(run.id);

    const report = orchestrator.updateMetadata.mock.calls[0]?.[1]?.continuityQa;
    expect(report).toMatchObject({
      status: 'partial',
      summary: { assessedClipCount: 1, errorClipCount: 1 },
    });
    expect(report.clips[0].errors[0].code).toBe('FRAME_EXTRACTION_FAILED');
    expect(report.clips[1].character.verdict).toBe('consistent');
    expect(llmDispatcher.chatCompletion).toHaveBeenCalledOnce();
    expect(task.findMany).toHaveBeenCalledWith({
      select: { decomposition: true, id: true },
      where: {
        isDeleted: false,
        organizationId: run.organizationId,
        projectId: run.projectId,
      },
    });
    expect(task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'task-1',
          isDeleted: false,
          organizationId: run.organizationId,
        },
      }),
    );
    expect(batchItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'batch-item-1',
          isDeleted: false,
          organizationId: run.organizationId,
        },
      }),
    );
  });

  it('waits until every expected clip reaches a terminal status', async () => {
    clipResults.findByProject.mockResolvedValue([
      clips[0],
      { ...clips[1], status: 'generating' },
    ]);

    await service.processRun(run.id);

    expect(stateStore.claim).not.toHaveBeenCalled();
    expect(orchestrator.updateMetadata).not.toHaveBeenCalled();
  });
});
