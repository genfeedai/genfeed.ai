import type { WorkspaceTaskJobData } from '@genfeedai/queue-contracts';
import { HttpException } from '@nestjs/common';
import { WorkspaceTaskProcessor } from '@workers/processors/api/services/task-orchestration/workspace-task.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function buildJob(
  data: Partial<WorkspaceTaskJobData>,
): Job<WorkspaceTaskJobData> {
  return {
    data: {
      organizationId: 'org-1',
      request: 'Make a video about launch week',
      taskId: 'task-1',
      userId: 'user-1',
      ...data,
    },
  } as unknown as Job<WorkspaceTaskJobData>;
}

describe('WorkspaceTaskProcessor', () => {
  let processor: WorkspaceTaskProcessor;
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
  let taskOrchestratorService: { orchestrate: ReturnType<typeof vi.fn> };
  let tasksService: {
    attachOutput: ReturnType<typeof vi.fn>;
    recordTaskEvent: ReturnType<typeof vi.fn>;
  };
  let avatarVideoGenerationService: {
    generateAvatarVideo: ReturnType<typeof vi.fn>;
  };
  let heygenPollQueueService: { schedule: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = { error: vi.fn(), log: vi.fn() };
    taskOrchestratorService = {
      orchestrate: vi.fn().mockResolvedValue(undefined),
    };
    tasksService = {
      attachOutput: vi.fn().mockResolvedValue(undefined),
      recordTaskEvent: vi.fn().mockResolvedValue(undefined),
    };
    avatarVideoGenerationService = {
      generateAvatarVideo: vi.fn().mockResolvedValue({
        externalId: 'heygen-1',
        ingredientId: 'ingredient-1',
      }),
    };
    heygenPollQueueService = { schedule: vi.fn().mockResolvedValue(undefined) };
    configService = { get: vi.fn().mockReturnValue(undefined) };

    processor = new WorkspaceTaskProcessor(
      logger as never,
      taskOrchestratorService as never,
      tasksService as never,
      avatarVideoGenerationService as never,
      heygenPollQueueService as never,
      configService as never,
    );
  });

  it('routes non-facecam tasks through the orchestrator', async () => {
    const job = buildJob({
      brandId: 'brand-1',
      brandName: 'Acme',
      outputType: 'video',
      platforms: ['tiktok'],
    });

    await processor.process(job);

    expect(taskOrchestratorService.orchestrate).toHaveBeenCalledWith({
      brandId: 'brand-1',
      brandName: 'Acme',
      organizationId: 'org-1',
      outputType: 'video',
      platforms: ['tiktok'],
      request: 'Make a video about launch week',
      taskId: 'task-1',
      userId: 'user-1',
    });
  });

  it('records a task failure and rethrows when orchestration fails', async () => {
    taskOrchestratorService.orchestrate.mockRejectedValue(
      new Error('orchestration exploded'),
    );

    await expect(processor.process(buildJob({}))).rejects.toThrow(
      'orchestration exploded',
    );

    expect(tasksService.recordTaskEvent).toHaveBeenCalledWith(
      'task-1',
      'org-1',
      'user-1',
      {
        payload: { error: 'orchestration exploded' },
        type: 'task_failed',
      },
      expect.objectContaining({
        failureReason: 'orchestration exploded',
        status: 'failed',
      }),
    );
  });

  it('swallows failures while recording the task failure event', async () => {
    taskOrchestratorService.orchestrate.mockRejectedValue(new Error('boom'));
    tasksService.recordTaskEvent.mockRejectedValue(new Error('event failed'));

    await expect(processor.process(buildJob({}))).rejects.toThrow('boom');

    expect(logger.error).toHaveBeenCalledWith(
      'WorkspaceTaskProcessor: Failed to update task status',
      expect.any(Error),
    );
  });

  it('rejects facecam tasks without script text', async () => {
    await expect(
      processor.process(buildJob({ outputType: 'facecam', request: '   ' })),
    ).rejects.toThrow('Facecam task requires non-empty request text');
  });

  it('dispatches facecam with a HeyGen catalog voice and schedules a poll fallback', async () => {
    const job = buildJob({
      heygenAvatarId: 'avatar-1',
      outputType: 'facecam',
      voiceId: 'voice-1',
      voiceProvider: 'heygen',
    });

    await processor.process(job);

    expect(
      avatarVideoGenerationService.generateAvatarVideo,
    ).toHaveBeenCalledWith(
      {
        aspectRatio: '9:16',
        avatarId: 'avatar-1',
        heygenVoiceId: 'voice-1',
        text: 'Make a video about launch week',
        useIdentity: false,
      },
      { brandId: undefined, organizationId: 'org-1', userId: 'user-1' },
    );
    expect(tasksService.attachOutput).toHaveBeenCalledWith(
      'task-1',
      'ingredient-1',
      'org-1',
      'user-1',
    );
    expect(heygenPollQueueService.schedule).toHaveBeenCalledWith({
      externalId: 'heygen-1',
      ingredientId: 'ingredient-1',
      organizationId: 'org-1',
      taskId: 'task-1',
      userId: 'user-1',
    });
  });

  it('routes non-HeyGen voices through clonedVoiceId and identity fallback', async () => {
    const job = buildJob({
      outputType: 'facecam',
      voiceId: 'voice-doc-1',
      voiceProvider: 'elevenlabs',
    });

    await processor.process(job);

    expect(
      avatarVideoGenerationService.generateAvatarVideo,
    ).toHaveBeenCalledWith(
      {
        aspectRatio: '9:16',
        clonedVoiceId: 'voice-doc-1',
        text: 'Make a video about launch week',
        useIdentity: true,
        voiceProvider: 'elevenlabs',
      },
      { brandId: undefined, organizationId: 'org-1', userId: 'user-1' },
    );
  });

  it('skips the poll fallback when webhooks are configured', async () => {
    configService.get.mockReturnValue('https://webhooks.genfeed.ai');

    await processor.process(buildJob({ outputType: 'facecam' }));

    expect(heygenPollQueueService.schedule).not.toHaveBeenCalled();
  });

  it('records the HttpException detail when facecam generation fails', async () => {
    avatarVideoGenerationService.generateAvatarVideo.mockRejectedValue(
      new HttpException('quota exceeded', 402),
    );
    tasksService.recordTaskEvent
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('event write failed'));

    await expect(
      processor.process(buildJob({ outputType: 'facecam' })),
    ).rejects.toThrow(HttpException);

    const failureCall = tasksService.recordTaskEvent.mock.calls.at(-1);
    expect(failureCall?.[3]).toEqual({
      payload: { error: 'quota exceeded' },
      type: 'task_failed',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'WorkspaceTaskProcessor: Failed to record facecam failure event',
      expect.any(Error),
    );
  });

  it('records the plain error message when facecam generation throws an Error', async () => {
    avatarVideoGenerationService.generateAvatarVideo.mockRejectedValue(
      new Error('provider down'),
    );

    await expect(
      processor.process(buildJob({ outputType: 'facecam' })),
    ).rejects.toThrow('provider down');

    const failureCall = tasksService.recordTaskEvent.mock.calls.at(-1);
    expect(failureCall?.[3]).toEqual({
      payload: { error: 'provider down' },
      type: 'task_failed',
    });
  });
});
