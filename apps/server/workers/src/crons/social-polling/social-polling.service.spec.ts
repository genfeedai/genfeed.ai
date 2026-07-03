import { WorkflowLifecycle, WorkflowStatus } from '@genfeedai/enums';
import { SocialPollingService } from '@workers/crons/social-polling/social-polling.service';

const mockPrismaService = {
  workflow: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
};

const mockExecutionQueue = {
  queueTriggerEvent: vi.fn(),
};

const mockTwitterAdapter = {
  createEngagementChecker: vi.fn(),
  createFollowerChecker: vi.fn(),
  createKeywordChecker: vi.fn(),
  createLikeChecker: vi.fn(),
  createMentionChecker: vi.fn(),
  createRepostChecker: vi.fn(),
};

const mockInstagramAdapter = {};
const mockYoutubeAdapter = {
  createCommentChecker: vi.fn(),
};

const mockLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

const mockConfigService = {
  isDevSchedulersEnabled: true,
};

type SocialPollingConstructorArgs = ConstructorParameters<
  typeof SocialPollingService
>;

function createService() {
  return new SocialPollingService(
    mockPrismaService as unknown as SocialPollingConstructorArgs[0],
    mockExecutionQueue as unknown as SocialPollingConstructorArgs[1],
    mockTwitterAdapter as unknown as SocialPollingConstructorArgs[2],
    mockInstagramAdapter as unknown as SocialPollingConstructorArgs[3],
    mockYoutubeAdapter as unknown as SocialPollingConstructorArgs[4],
    mockConfigService as unknown as SocialPollingConstructorArgs[5],
    mockLogger as unknown as SocialPollingConstructorArgs[6],
  );
}

describe('SocialPollingService', () => {
  let service: SocialPollingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigService.isDevSchedulersEnabled = true;
    service = createService();
    mockPrismaService.workflow.findMany.mockResolvedValue([]);
    mockPrismaService.workflow.update.mockResolvedValue({});
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip if already running', async () => {
    // Start first poll
    mockPrismaService.workflow.findMany.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 100)),
    );

    const poll1 = service.pollSocialTriggers();
    const poll2 = service.pollSocialTriggers();

    await Promise.all([poll1, poll2]);

    // Should warn about skipping
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipping'),
    );
  });

  it('should find workflows with social trigger nodes', async () => {
    mockPrismaService.workflow.findMany.mockResolvedValue([]);

    await service.pollSocialTriggers();

    expect(mockPrismaService.workflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
        where: expect.objectContaining({
          isDeleted: false,
          lifecycle: WorkflowLifecycle.PUBLISHED,
          status: WorkflowStatus.ACTIVE,
        }),
      }),
    );
  });

  it('should skip polling when local schedulers are disabled', async () => {
    mockConfigService.isDevSchedulersEnabled = false;

    await service.pollSocialTriggers();

    expect(mockPrismaService.workflow.findMany).not.toHaveBeenCalled();
  });

  it('should trigger workflow execution when mention found', async () => {
    const mockMention = {
      authorId: 'author1',
      authorUsername: 'author',
      mentionedAt: '2026-02-23T12:00:00Z',
      platform: 'twitter',
      postId: 'tweet123',
      postUrl: 'https://twitter.com/...',
      text: 'hey @user',
    };

    const mockWorkflow = {
      config: {},
      id: 'wf1',
      nodes: [
        {
          data: { config: { platform: 'twitter' } },
          id: 'node1',
          type: 'mentionTrigger',
        },
      ],
      organizationId: 'org1',
      userId: 'user1',
    };

    mockPrismaService.workflow.findMany.mockResolvedValue([mockWorkflow]);

    mockTwitterAdapter.createMentionChecker.mockReturnValue(
      vi.fn().mockResolvedValue(mockMention),
    );

    await service.pollSocialTriggers();

    expect(mockExecutionQueue.queueTriggerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org1',
        platform: 'twitter',
        type: 'mentionTrigger',
        userId: 'user1',
      }),
    );

    // Should update poll state
    expect(mockPrismaService.workflow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            metadata: expect.objectContaining({
              pollState: expect.objectContaining({
                node1: 'tweet123',
              }),
            }),
          }),
        }),
        where: { id: 'wf1' },
      }),
    );
  });

  it('should not trigger when checker returns null', async () => {
    const mockWorkflow = {
      config: {},
      id: 'wf2',
      nodes: [
        {
          data: { config: { platform: 'twitter' } },
          id: 'node1',
          type: 'mentionTrigger',
        },
      ],
      organizationId: 'org1',
      userId: 'user1',
    };

    mockPrismaService.workflow.findMany.mockResolvedValue([mockWorkflow]);

    mockTwitterAdapter.createMentionChecker.mockReturnValue(
      vi.fn().mockResolvedValue(null),
    );

    await service.pollSocialTriggers();

    expect(mockExecutionQueue.queueTriggerEvent).not.toHaveBeenCalled();
  });

  it('should handle errors per-workflow without stopping cycle', async () => {
    const workflows = [
      {
        config: {},
        id: 'wf-good',
        nodes: [
          {
            data: { config: { platform: 'twitter' } },
            id: 'n1',
            type: 'mentionTrigger',
          },
        ],
        organizationId: 'org1',
        userId: 'user1',
      },
      {
        config: {},
        id: 'wf-bad',
        nodes: [
          {
            data: { config: { platform: 'twitter' } },
            id: 'n2',
            type: 'mentionTrigger',
          },
        ],
        organizationId: 'org2',
        userId: 'user2',
      },
    ];

    mockPrismaService.workflow.findMany.mockResolvedValue(workflows);

    let callCount = 0;
    mockTwitterAdapter.createMentionChecker.mockReturnValue(
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('API error');
        }
        return null;
      }),
    );

    await service.pollSocialTriggers();

    // Should log trigger-level error for first workflow but continue to second
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('trigger check failed'),
      expect.any(Object),
    );
    // Should still update poll state for second workflow
    expect(mockPrismaService.workflow.update).toHaveBeenCalled();
  });
});
