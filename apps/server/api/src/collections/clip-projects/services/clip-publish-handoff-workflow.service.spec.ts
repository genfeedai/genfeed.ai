import type { LoggerService } from '@libs/logger/logger.service';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { describe, expect, it, vi } from 'vitest';
import { ClipPublishHandoffWorkflowService } from './clip-publish-handoff-workflow.service';

describe('ClipPublishHandoffWorkflowService', () => {
  it('executes the public operation through its registered action', async () => {
    let action: SystemWorkflowActionExecutor | undefined;
    const runner = {
      registerAction: vi.fn(
        (_actionId: string, executor: SystemWorkflowActionExecutor) => {
          action = executor;
        },
      ),
      runAction: vi.fn().mockResolvedValue({ result: { preparedAt: 'now' } }),
    };
    const service = new ClipPublishHandoffWorkflowService(
      { log: vi.fn() } as unknown as LoggerService,
      runner as unknown as SystemWorkflowRunnerService,
    );
    service.onModuleInit();

    await service.preparePublishHandoff(
      { assetIds: ['asset-1'], clipProjectId: 'project-1' },
      { organizationId: 'org-1', userId: 'user-1' },
    );

    expect(runner.registerAction).toHaveBeenCalledWith(
      'clip.handoff.prepare-publish',
      expect.any(Function),
    );
    expect(runner.runAction).toHaveBeenCalledWith({
      actionType: 'clip-publish-handoff',
      canonicalId: 'clip.handoff.prepare-publish',
      inputValues: { assetIds: ['asset-1'], clipProjectId: 'project-1' },
      organizationId: 'org-1',
      source: 'clip-project-handoff',
      userId: 'user-1',
    });
    expect(action).toBeDefined();
  });

  it('builds a confirmation-required publish payload inside the action', async () => {
    let action: SystemWorkflowActionExecutor | undefined;
    const runner = {
      registerAction: vi.fn(
        (_actionId: string, executor: SystemWorkflowActionExecutor) => {
          action = executor;
        },
      ),
      runAction: vi.fn(),
    };
    const service = new ClipPublishHandoffWorkflowService(
      { log: vi.fn() } as unknown as LoggerService,
      runner as unknown as SystemWorkflowRunnerService,
    );
    service.onModuleInit();
    if (!action) {
      throw new Error('Publish handoff action was not registered');
    }

    await expect(
      action({
        context: {} as never,
        input: {
          assetIds: ['asset-1'],
          clipProjectId: 'project-1',
          options: {
            assets: {
              'asset-1': {
                caption: 'Caption',
                mediaUrl: 'https://cdn.test/asset-1.mp4',
                mimeType: 'video/mp4',
              },
            },
          },
        },
        provenance: {
          executionId: 'execution-1',
          workflowId: 'workflow-1',
          workflowLabel: 'Prepare Clip Publish Handoff',
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        assets: [
          {
            assetId: 'asset-1',
            caption: 'Caption',
            mediaUrl: 'https://cdn.test/asset-1.mp4',
            mimeType: 'video/mp4',
          },
        ],
        clipProjectId: 'project-1',
        confirmBeforePublish: true,
        platforms: ['instagram'],
        schedule: 'immediate',
      }),
    );
  });
});
