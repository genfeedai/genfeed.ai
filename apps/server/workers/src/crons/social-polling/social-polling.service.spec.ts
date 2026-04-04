import { SocialPollingService } from '@workers/crons/social-polling/social-polling.service';

const mockWorkflowModel = {
  find: vi.fn(),
  updateOne: vi.fn(),
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
    mockWorkflowModel as unknown as SocialPollingConstructorArgs[0],
    mockExecutionQueue as unknown as SocialPollingConstructorArgs[1],
    mockTwitterAdapter as unknown as SocialPollingConstructorArgs[2],
    mockInstagramAdapter as unknown as SocialPollingConstructorArgs[3],
    mockConfigService as unknown as SocialPollingConstructorArgs[4],
    mockLogger as unknown as SocialPollingConstructorArgs[5],
  );
}

describe('SocialPollingService', () => {
  let service: SocialPollingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigService.isDevSchedulersEnabled = true;
    service = createService();
    mockWorkflowModel.find.mockReturnValue({
      limit: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
    });
    mockWorkflowModel.updateOne.mockResolvedValue({});
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip if already running', async () => {
    // Start first poll
    mockWorkflowModel.find.mockReturnValue({
      limit: vi.fn().mockReturnValue({
        exec: vi
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve([]), 100)),
          ),
      }),
    });

    const poll1 = service.pollSocialTriggers();
    const poll2 = service.pollSocialTriggers();

    await Promise.all([poll1, poll2]);

    // Should warn about skipping
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipping'),
    );
  });

  it('should find workflows with social trigger nodes', async () => {
    mockWorkflowModel.find.mockReturnValue({
      limit: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
    });

    await service.pollSocialTriggers();

    expect(mockWorkflowModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        isDeleted: false,
        'nodes.type': { $in: expect.arrayContaining(['mentionTrigger']) },
        status: 'active',
      }),
    );
  });

  it('should skip polling when local schedulers are disabled', async () => {
    mockConfigService.isDevSchedulersEnabled = false;

    await service.pollSocialTriggers();

    expect(mockWorkflowModel.find).not.toHaveBeenCalled();
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
      _id: 'wf1',
      metadata: {},
      nodes: [
        {
          data: { config: { platform: 'twitter' } },
          id: 'node1',
          type: 'mentionTrigger',
        },
      ],
      organization: { toString: () => 'org1' },
      user: { toString: () => 'user1' },
    };

    mockWorkflowModel.find.mockReturnValue({
      limit: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([mockWorkflow]),
      }),
    });

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
    expect(mockWorkflowModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'wf1',
        isDeleted: false,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          'metadata.pollState': expect.objectContaining({
            node1: 'tweet123',
          }),
        }),
      }),
    );
  });

  it('should not trigger when checker returns null', async () => {
    const mockWorkflow = {
      _id: 'wf2',
      metadata: {},
      nodes: [
        {
          data: { config: { platform: 'twitter' } },
          id: 'node1',
          type: 'mentionTrigger',
        },
      ],
      organization: { toString: () => 'org1' },
      user: { toString: () => 'user1' },
    };

    mockWorkflowModel.find.mockReturnValue({
      limit: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([mockWorkflow]),
      }),
    });

    mockTwitterAdapter.createMentionChecker.mockReturnValue(
      vi.fn().mockResolvedValue(null),
    );

    await service.pollSocialTriggers();

    expect(mockExecutionQueue.queueTriggerEvent).not.toHaveBeenCalled();
  });

  it('should handle errors per-workflow without stopping cycle', async () => {
    const workflows = [
      {
        _id: 'wf-good',
        metadata: {},
        nodes: [
          {
            data: { config: { platform: 'twitter' } },
            id: 'n1',
            type: 'mentionTrigger',
          },
        ],
        organization: { toString: () => 'org1' },
        user: { toString: () => 'user1' },
      },
      {
        _id: 'wf-bad',
        metadata: {},
        nodes: [
          {
            data: { config: { platform: 'twitter' } },
            id: 'n2',
            type: 'mentionTrigger',
          },
        ],
        organization: { toString: () => 'org2' },
        user: { toString: () => 'user2' },
      },
    ];

    mockWorkflowModel.find.mockReturnValue({
      limit: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(workflows),
      }),
    });

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
    expect(mockWorkflowModel.updateOne).toHaveBeenCalled();
  });
});
