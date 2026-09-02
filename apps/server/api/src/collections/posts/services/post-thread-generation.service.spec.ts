vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostThreadGenerationService } from '@api/collections/posts/services/post-thread-generation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { PostStatus, Status, TargetExecutionState } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const extraChildPostId = testId('post', 4);

describe('PostThreadGenerationService', () => {
  let service: PostThreadGenerationService;

  const identity = {
    brandId: testId('brand'),
    organizationId: testId('org'),
    userId: testId('user'),
  };
  const originalPost = {
    id: testId('post', 1),
    description: 'Original tweet content',
  } as PostDocument;
  const childPosts = [
    { id: testId('post', 2) },
    { id: testId('post', 3) },
  ] as PostDocument[];
  const activity = { id: testId('activity') };

  const activitiesService = {
    create: vi.fn().mockResolvedValue(activity),
    patch: vi.fn().mockResolvedValue(activity),
  };
  const loggerService = {
    error: vi.fn(),
  };
  const postsService = {
    patch: vi
      .fn()
      .mockImplementation((id: string, patch: unknown) =>
        Promise.resolve({ id, ...(patch as Record<string, unknown>) }),
      ),
  };
  const promptBuilderService = {
    buildPrompt: vi.fn().mockResolvedValue({ input: { prompt: 'thread' } }),
  };
  const replicateService = {
    generateTextCompletionSync: vi
      .fn()
      .mockResolvedValue(JSON.stringify(['Reply one', 'Reply two'])),
  };
  const templatesService = {
    getRenderedPrompt: vi.fn().mockResolvedValue('Expand this thread'),
  };
  const websocketService = {
    emit: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    activitiesService.create.mockResolvedValue(activity);
    activitiesService.patch.mockResolvedValue(activity);
    postsService.patch.mockImplementation((id: string, patch: unknown) =>
      Promise.resolve({ id, ...(patch as Record<string, unknown>) }),
    );
    promptBuilderService.buildPrompt.mockResolvedValue({
      input: { prompt: 'thread' },
    });
    replicateService.generateTextCompletionSync.mockResolvedValue(
      JSON.stringify(['Reply one', 'Reply two']),
    );
    templatesService.getRenderedPrompt.mockResolvedValue('Expand this thread');
    websocketService.emit.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostThreadGenerationService,
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: LoggerService, useValue: loggerService },
        { provide: PostsService, useValue: postsService },
        { provide: PromptBuilderService, useValue: promptBuilderService },
        { provide: ReplicateService, useValue: replicateService },
        { provide: TemplatesService, useValue: templatesService },
        {
          provide: NotificationsPublisherService,
          useValue: websocketService,
        },
      ],
    }).compile();

    service = module.get(PostThreadGenerationService);
  });

  it('completes generated children in order with activities and websocket evidence', async () => {
    await service.expandThread(
      originalPost,
      childPosts,
      { count: 3, tone: TweetTone.PROFESSIONAL },
      identity,
    );

    expect(postsService.patch).toHaveBeenNthCalledWith(
      1,
      childPosts[0].id,
      expect.objectContaining({
        description: 'Reply one',
        label: 'Reply one',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
      expect.any(Array),
    );
    expect(postsService.patch).toHaveBeenNthCalledWith(
      2,
      childPosts[1].id,
      expect.objectContaining({
        description: 'Reply two',
        label: 'Reply two',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
      expect.any(Array),
    );
    expect(websocketService.emit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: Status.COMPLETED }),
    );
    expect(activitiesService.create).toHaveBeenCalledTimes(3);
  });

  it('fails only unresolved children when the provider returns too few replies', async () => {
    replicateService.generateTextCompletionSync.mockResolvedValueOnce(
      JSON.stringify(['Only reply']),
    );

    await service.expandThread(
      originalPost,
      childPosts,
      { count: 3, tone: TweetTone.PROFESSIONAL },
      identity,
    );

    expect(postsService.patch).toHaveBeenCalledWith(
      childPosts[0].id,
      expect.objectContaining({
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
      expect.any(Array),
    );
    expect(postsService.patch).toHaveBeenCalledWith(childPosts[1].id, {
      targetExecutionState: TargetExecutionState.FAILED,
    });
  });

  it('continues the thread when one generated child cannot be updated', async () => {
    postsService.patch
      .mockRejectedValueOnce(new Error('first child unavailable'))
      .mockResolvedValueOnce({
        id: childPosts[0].id,
        status: PostStatus.FAILED,
      })
      .mockResolvedValueOnce({
        id: childPosts[1].id,
        status: PostStatus.DRAFT,
      });

    await service.expandThread(
      originalPost,
      childPosts,
      { count: 3, tone: TweetTone.PROFESSIONAL },
      identity,
    );

    expect(postsService.patch).toHaveBeenCalledWith(childPosts[0].id, {
      targetExecutionState: TargetExecutionState.FAILED,
    });
    expect(postsService.patch).toHaveBeenCalledWith(
      childPosts[1].id,
      expect.objectContaining({
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
      expect.any(Array),
    );
    expect(websocketService.emit).toHaveBeenCalledWith(
      expect.stringContaining(String(childPosts[1].id)),
      expect.objectContaining({ status: Status.COMPLETED }),
    );
  });

  it('continues failed-child cleanup when one status patch rejects', async () => {
    const cleanupChildren = [
      ...childPosts,
      { id: extraChildPostId } as PostDocument,
    ];
    replicateService.generateTextCompletionSync.mockResolvedValueOnce(
      JSON.stringify(['Only reply']),
    );
    postsService.patch
      .mockResolvedValueOnce({
        id: cleanupChildren[0].id,
        status: PostStatus.DRAFT,
      })
      .mockRejectedValueOnce(new Error('failed status unavailable'))
      .mockResolvedValueOnce({
        id: cleanupChildren[2].id,
        status: PostStatus.FAILED,
      });

    await service.expandThread(
      originalPost,
      cleanupChildren,
      { count: 4, tone: TweetTone.PROFESSIONAL },
      identity,
    );

    expect(postsService.patch).toHaveBeenCalledWith(cleanupChildren[1].id, {
      targetExecutionState: TargetExecutionState.FAILED,
    });
    expect(postsService.patch).toHaveBeenCalledWith(cleanupChildren[2].id, {
      targetExecutionState: TargetExecutionState.FAILED,
    });
    expect(loggerService.error).toHaveBeenCalledWith(
      `Failed to update post ${cleanupChildren[1].id} to FAILED status`,
      expect.any(Error),
    );
  });

  it('rejects thread replies over the X weighted-character limit', async () => {
    const overLimitReply = 'a'.repeat(300);
    replicateService.generateTextCompletionSync.mockResolvedValueOnce(
      JSON.stringify([overLimitReply, overLimitReply]),
    );

    await service.expandThread(
      originalPost,
      childPosts,
      { count: 3, tone: TweetTone.PROFESSIONAL },
      identity,
    );

    expect(postsService.patch).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
      expect.any(Array),
    );
    expect(postsService.patch).toHaveBeenCalledWith(childPosts[0].id, {
      targetExecutionState: TargetExecutionState.FAILED,
    });
    expect(postsService.patch).toHaveBeenCalledWith(childPosts[1].id, {
      targetExecutionState: TargetExecutionState.FAILED,
    });
  });

  it('preserves child positions when an intermediate reply is invalid', async () => {
    const positionedChildren = [
      ...childPosts,
      { id: extraChildPostId } as PostDocument,
    ];
    replicateService.generateTextCompletionSync.mockResolvedValueOnce(
      JSON.stringify(['Reply one', 'a'.repeat(300), 'Reply three']),
    );

    await service.expandThread(
      originalPost,
      positionedChildren,
      { count: 4, tone: TweetTone.PROFESSIONAL },
      identity,
    );

    expect(postsService.patch).toHaveBeenNthCalledWith(
      1,
      positionedChildren[0].id,
      expect.objectContaining({
        description: 'Reply one',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
      expect.any(Array),
    );
    expect(postsService.patch).toHaveBeenNthCalledWith(
      2,
      positionedChildren[1].id,
      { targetExecutionState: TargetExecutionState.FAILED },
    );
    expect(postsService.patch).toHaveBeenNthCalledWith(
      3,
      positionedChildren[2].id,
      expect.objectContaining({
        description: 'Reply three',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
      expect.any(Array),
    );
  });

  it('rejects non-string JSON replies without shifting later children', async () => {
    replicateService.generateTextCompletionSync.mockResolvedValueOnce(
      JSON.stringify([{ text: 'malformed' }, 'Reply two']),
    );

    await service.expandThread(
      originalPost,
      childPosts,
      { count: 3, tone: TweetTone.PROFESSIONAL },
      identity,
    );

    expect(postsService.patch).toHaveBeenNthCalledWith(1, childPosts[0].id, {
      targetExecutionState: TargetExecutionState.FAILED,
    });
    expect(postsService.patch).toHaveBeenNthCalledWith(
      2,
      childPosts[1].id,
      expect.objectContaining({
        description: 'Reply two',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
      expect.any(Array),
    );
  });

  it('marks every child failed when activity creation throws', async () => {
    activitiesService.create.mockRejectedValueOnce(
      new Error('activity store down'),
    );

    await service.expandThread(
      originalPost,
      childPosts,
      { count: 3, tone: TweetTone.PROFESSIONAL },
      identity,
    );

    expect(activitiesService.patch).not.toHaveBeenCalled();
    expect(postsService.patch).toHaveBeenCalledWith(childPosts[0].id, {
      targetExecutionState: TargetExecutionState.FAILED,
    });
    expect(postsService.patch).toHaveBeenCalledWith(childPosts[1].id, {
      targetExecutionState: TargetExecutionState.FAILED,
    });
  });

  it('continues child cleanup when the failure activity cannot be updated', async () => {
    replicateService.generateTextCompletionSync.mockRejectedValueOnce(
      new Error('provider unavailable'),
    );
    activitiesService.patch.mockRejectedValueOnce(
      new Error('activity update unavailable'),
    );

    await service.expandThread(
      originalPost,
      childPosts,
      { count: 3, tone: TweetTone.PROFESSIONAL },
      identity,
    );

    expect(postsService.patch).toHaveBeenCalledWith(childPosts[0].id, {
      targetExecutionState: TargetExecutionState.FAILED,
    });
    expect(postsService.patch).toHaveBeenCalledWith(childPosts[1].id, {
      targetExecutionState: TargetExecutionState.FAILED,
    });
    expect(loggerService.error).toHaveBeenCalledWith(
      'Failed to mark activity as failed during thread expansion cleanup',
      expect.any(Error),
    );
  });
});
