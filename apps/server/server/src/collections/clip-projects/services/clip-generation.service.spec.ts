import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import type { ClipProjectsService } from '@server/collections/clip-projects/clip-projects.service';
import type { ClipResultsService } from '@server/collections/clip-results/clip-results.service';
import type { SystemWorkflowActionExecutor } from '@server/collections/workflows/system-workflow-runner.service';
import type { AvatarVideoService } from '@server/services/avatar-video/avatar-video.service';
import type { AvatarVideoProvider } from '@server/services/avatar-video/avatar-video-provider.interface';
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
    startWorkflowDefinition: vi.fn(),
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
  return {
    execution: {
      executionId: 'execution-1',
      nodeResults: [
        {
          creditsUsed: 0,
          nodeId: 'collect-clip-results',
          nodeType: 'genfeedAction',
          output: result,
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
  it('registers one atomic generator and one result collector action', () => {
    const { actions } = createHarness();

    expect([...actions.keys()]).toEqual([
      'clip.generation.generate-one',
      'clip.generation.collect-results',
    ]);
  });

  it('starts a persisted graph and links the project to its execution', async () => {
    const { projects, runner, service } = createHarness();
    const result: ClipGenerationResult = {
      clipResultIds: ['clip-1', 'clip-2'],
      providerJobIds: ['job-1', 'job-2'],
      queuedClipCount: 2,
    };
    runner.startWorkflowDefinition.mockResolvedValue(
      completedExecution(result),
    );

    await expect(service.generateClips(request)).resolves.toEqual(result);
    expect(runner.startWorkflowDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ resultNodeId: 'collect-clip-results' }),
      expect.objectContaining({
        inputValues: { request },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    expect(projects.patch).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ workflowExecutionId: 'execution-1' }),
      [],
      'org-1',
    );
  });

  it('returns only the hook output while its native review gate is pending', async () => {
    const { runner, service } = createHarness();
    const hookResult: ClipGenerationResult = {
      clipResultIds: ['hook-result'],
      providerJobIds: ['hook-job'],
      queuedClipCount: 1,
    };
    runner.startWorkflowDefinition.mockResolvedValue({
      ...completedExecution(hookResult),
      execution: {
        ...completedExecution(hookResult).execution,
        nodeResults: [
          {
            creditsUsed: 0,
            nodeId: 'generate-clip-1',
            nodeType: 'genfeedAction',
            output: hookResult,
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

  it('collects action outputs in their original highlight order', async () => {
    const { actions } = createHarness();
    const executor = actions.get('clip.generation.collect-results');
    if (!executor) {
      throw new Error('collect-results action was not registered');
    }

    await expect(
      executor({
        context: {} as never,
        input: {
          clip1: {
            clipResultIds: ['clip-2'],
            providerJobIds: ['job-2'],
            queuedClipCount: 1,
          },
          clip0: {
            clipResultIds: ['clip-1'],
            providerJobIds: ['job-1'],
            queuedClipCount: 1,
          },
        },
        provenance: {
          executionId: 'execution-1',
          workflowId: 'workflow-1',
          workflowLabel: 'Clip Generation',
        },
      }),
    ).resolves.toEqual({
      clipResultIds: ['clip-1', 'clip-2'],
      providerJobIds: ['job-1', 'job-2'],
      queuedClipCount: 2,
    });
  });
});
