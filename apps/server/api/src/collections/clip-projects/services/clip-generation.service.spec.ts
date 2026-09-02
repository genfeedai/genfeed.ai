import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { SystemWorkflowActionExecutor } from '@api/collections/workflows/system-workflow-runner.service';
import type { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import type { AvatarVideoProvider } from '@api/services/avatar-video/avatar-video-provider.interface';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import {
  type ClipGenerationInput,
  type ClipGenerationResult,
  ClipGenerationService,
} from './clip-generation.service';
import type { RawCutClipService } from './raw-cut-clip.service';

const request: ClipGenerationInput = {
  avatarId: 'avatar-1',
  highlights: [
    {
      clip_type: 'hook',
      end_time: 20,
      start_time: 0,
      summary: 'Hook summary',
      tags: ['hook'],
      title: 'Hook',
      virality_score: 90,
    },
    {
      clip_type: 'body',
      end_time: 40,
      start_time: 20,
      summary: 'Body summary',
      tags: ['body'],
      title: 'Body',
      virality_score: 80,
    },
  ],
  hookApprovalRequired: false,
  orgId: 'org-1',
  projectId: 'project-1',
  userId: 'user-1',
  voiceId: 'voice-1',
};

function createHarness() {
  const actions = new Map<string, SystemWorkflowActionExecutor>();
  const runner = {
    registerAction: vi.fn(
      (actionId: string, executor: SystemWorkflowActionExecutor) => {
        actions.set(actionId, executor);
      },
    ),
    registerWorkflow: vi.fn(),
    startWorkflow: vi.fn(),
  };
  const moduleRef = {
    get: vi.fn().mockReturnValue(runner),
  };
  const clipResults = {
    create: vi.fn().mockResolvedValue({ id: 'clip-result-1' }),
    createGenerated: vi.fn().mockResolvedValue({ id: 'clip-result-1' }),
    patch: vi.fn().mockResolvedValue({}),
    transitionProviderTerminal: vi.fn().mockResolvedValue(true),
  };
  const provider: Pick<AvatarVideoProvider, 'generateVideo'> = {
    generateVideo: vi.fn().mockResolvedValue({
      jobId: 'job-1',
      providerName: 'heygen',
      status: 'processing',
    }),
  };
  const avatarVideo = { getProvider: vi.fn().mockReturnValue(provider) };
  const rawCut = { dispatchClip: vi.fn() };
  const projects = { patch: vi.fn().mockResolvedValue({}) };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
  };
  const service = new ClipGenerationService(
    clipResults as unknown as ClipResultsService,
    avatarVideo as unknown as AvatarVideoService,
    rawCut as unknown as RawCutClipService,
    logger as unknown as LoggerService,
    undefined,
    projects as unknown as ClipProjectsService,
    moduleRef as unknown as ModuleRef,
  );
  service.onModuleInit();
  return {
    actions,
    clipResults,
    moduleRef,
    projects,
    provider,
    runner,
    service,
  };
}

function completedExecution(result: ClipGenerationResult) {
  const childResults = result.clipResultIds.map((clipResultId, index) => ({
    index,
    provenance: {
      executionId: `child-execution-${index}`,
      workflowId: 'clip.generation.one',
      workflowLabel: 'Generate One Clip',
    },
    result: {
      clipResultIds: [clipResultId],
      originalIndex: index,
      providerJobIds: [result.providerJobIds[index] ?? ''],
      queuedClipCount: result.providerJobIds[index] ? 1 : 0,
    },
  }));
  return {
    execution: {
      executionId: 'execution-1',
      nodeResults: [
        {
          creditsUsed: 0,
          nodeId: 'generate-remaining',
          nodeType: 'genfeedAction',
          output: { count: childResults.length, results: childResults },
          retryCount: 0,
          status: 'completed',
        },
      ],
      startedAt: new Date(),
      status: 'COMPLETED',
      totalCreditsUsed: 0,
      workflowId: 'workflow-1',
    },
    provenance: {
      executionId: 'execution-1',
      workflowId: 'workflow-1',
      workflowLabel: 'Clip Generation',
    },
  };
}

describe('ClipGenerationService workflow boundary', () => {
  it('registers one atomic generator and the immutable parent workflow', () => {
    const { actions, runner } = createHarness();

    expect([...actions.keys()]).toEqual(['clip.generation.generate-one']);
    expect(runner.registerWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: 'clip.generation' }),
    );
  });

  it('starts the immutable graph with all project state owned by its actions', async () => {
    const { projects, runner, service } = createHarness();
    const result: ClipGenerationResult = {
      clipResultIds: ['clip-1', 'clip-2'],
      providerJobIds: ['job-1', 'job-2'],
      queuedClipCount: 2,
    };
    runner.startWorkflow.mockResolvedValue(completedExecution(result));

    await expect(service.generateClips(request)).resolves.toEqual(result);
    expect(runner.startWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'clip.generation',
        canonicalId: 'clip.generation',
        inputValues: { request, reviewContext: { attempt: 1 } },
        metadata: expect.objectContaining({
          clipHookReviewAttempt: 1,
          projectId: 'project-1',
        }),
        organizationId: 'org-1',
        source: 'clip.generation',
        userId: 'user-1',
      }),
    );
    expect(projects.patch).not.toHaveBeenCalled();
  });

  it('returns only the hook output while its native review gate is pending', async () => {
    const { runner, service } = createHarness();
    const hookResult: ClipGenerationResult = {
      clipResultIds: ['hook-result'],
      providerJobIds: ['hook-job'],
      queuedClipCount: 1,
    };
    runner.startWorkflow.mockResolvedValue({
      ...completedExecution(hookResult),
      execution: {
        ...completedExecution(hookResult).execution,
        nodeResults: [
          {
            creditsUsed: 0,
            nodeId: 'generate-hook',
            nodeType: 'genfeedAction',
            output: {
              count: 1,
              results: [
                {
                  index: 0,
                  result: { ...hookResult, originalIndex: 0 },
                },
              ],
            },
            retryCount: 0,
            status: 'COMPLETED',
          },
        ],
        status: 'RUNNING',
      },
    });

    await expect(
      service.generateClips({ ...request, hookApprovalRequired: true }),
    ).resolves.toEqual({ ...hookResult, awaitingHookApproval: true });
  });

  it('dispatches exactly the highlight selected by the action node', async () => {
    const { actions, clipResults, provider } = createHarness();
    const executor = actions.get('clip.generation.generate-one');
    if (!executor) {
      throw new Error('generate-one action was not registered');
    }

    await executor({
      context: {} as never,
      input: { originalIndex: 1, request },
      provenance: {
        executionId: 'execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'Clip Generation',
      },
    });

    expect(provider.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({ script: 'Body. Body summary' }),
    );
    expect(clipResults.create).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1, title: 'Body' }),
    );
  });
});
