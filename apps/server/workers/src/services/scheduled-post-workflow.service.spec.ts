import { TargetExecutionState } from '@genfeedai/enums';
import {
  SCHEDULED_POST_ACTION_IDS,
  type ScheduledPostWorkflowInput,
} from '@server/collections/posts/services/scheduled-post-workflow-definition';
import { ScheduledPostWorkflowService } from '@workers/services/scheduled-post-workflow.service';

type RegisteredActionRequest = {
  input: Record<string, unknown>;
};

type RegisteredAction = (request: RegisteredActionRequest) => Promise<unknown>;

function createHarness() {
  const registeredActions = new Map<string, RegisteredAction>();
  const activitiesService = {
    create: vi.fn().mockResolvedValue(undefined),
  };
  const discoveryService = {
    findPost: vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      id: 'post-1',
      organizationId: 'org-1',
      userId: 'user-1',
    }),
  };
  const publishApprovalsService = {
    completeExecution: vi.fn().mockResolvedValue(undefined),
  };
  const repeatScheduler = {
    scheduleNextRepeat: vi.fn().mockResolvedValue(undefined),
  };
  const runner = {
    registerAction: vi.fn((actionId: string, action: RegisteredAction) => {
      registeredActions.set(actionId, action);
    }),
    registerWorkflow: vi.fn(),
  };
  const service = new ScheduledPostWorkflowService(
    activitiesService as never,
    {} as never,
    discoveryService as never,
    {} as never,
    {} as never,
    publishApprovalsService as never,
    repeatScheduler as never,
    runner as never,
  );
  service.onModuleInit();

  return {
    activitiesService,
    publishApprovalsService,
    registeredActions,
    repeatScheduler,
  };
}

async function finalize(
  registeredActions: Map<string, RegisteredAction>,
  executionState: TargetExecutionState,
  deliveryOverrides: Record<string, unknown> = {},
) {
  const action = registeredActions.get(SCHEDULED_POST_ACTION_IDS.FINALIZE);
  if (!action) {
    throw new Error('Scheduled post finalize action was not registered');
  }
  const request: ScheduledPostWorkflowInput = {
    approvalId: 'approval-1',
    operationId: 'operation-1',
    organizationId: 'org-1',
    postId: 'post-1',
    source: 'tiktok_app',
    userId: 'user-1',
    versionPinId: 'pin-1',
  };

  return action({
    input: {
      claim: {
        executionStartedAt: '2026-08-31T10:00:00.000Z',
        isAlreadyPublished: false,
        publishedResult: {},
      },
      delivery: {
        executionState,
        externalId: 'tiktok-upload-1',
        platform: 'tiktok',
        success: true,
        url: '',
        ...deliveryOverrides,
      },
      request,
    },
  });
}

describe('ScheduledPostWorkflowService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not announce or repeat a successful TikTok app handoff that is still publishing', async () => {
    const harness = createHarness();

    await finalize(harness.registeredActions, TargetExecutionState.PUBLISHING);

    expect(
      harness.publishApprovalsService.completeExecution,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: 'approval-1',
        isSuccessful: true,
      }),
    );
    expect(harness.activitiesService.create).not.toHaveBeenCalled();
    expect(harness.repeatScheduler.scheduleNextRepeat).not.toHaveBeenCalled();
  });

  it('announces and repeats a successful public publish', async () => {
    const harness = createHarness();

    await finalize(harness.registeredActions, TargetExecutionState.PUBLISHED);

    expect(harness.activitiesService.create).toHaveBeenCalledOnce();
    expect(harness.repeatScheduler.scheduleNextRepeat).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'post-1' }),
      'ScheduledPostWorkflowService.finalize',
    );
  });

  it('does not announce or repeat a published provider draft', async () => {
    const harness = createHarness();

    await finalize(harness.registeredActions, TargetExecutionState.PUBLISHED, {
      isProviderDraft: true,
    });

    expect(harness.activitiesService.create).not.toHaveBeenCalled();
    expect(harness.repeatScheduler.scheduleNextRepeat).not.toHaveBeenCalled();
  });
});
