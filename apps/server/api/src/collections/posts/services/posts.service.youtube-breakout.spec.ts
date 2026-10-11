import { assertBreakoutPublicationDispatch } from '@api/collections/outliers/services/breakout-publication-fence.util';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

// The dispatch fence is the unit under integration here: keep its real behavior for an
// ordinary post and let each breakout case choose the admission outcome.
vi.mock(
  '@api/collections/outliers/services/breakout-publication-fence.util',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@api/collections/outliers/services/breakout-publication-fence.util')
      >();
    return {
      ...actual,
      assertBreakoutPublicationDispatch: vi.fn(
        actual.assertBreakoutPublicationDispatch,
      ),
    };
  },
);

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

function makeService(breakoutOutputId: string | null = null) {
  const calls: string[] = [];
  const post = {
    findFirst: vi.fn(async () => ({ breakoutOutputId })),
  };
  const prisma = {
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) =>
      run({ post }),
    ),
    post,
  };
  const fileQueue = {
    uploadYoutube: vi.fn(async () => {
      calls.push('upload');
      return { jobId: 'job-1' };
    }),
  };
  const service = new PostsService(
    prisma as unknown as PrismaService,
    logger as unknown as LoggerService,
    { completeMissions: vi.fn() } as never,
    undefined,
    fileQueue as unknown as FileQueueService,
  );
  const patch = vi
    .spyOn(service, 'patch')
    .mockImplementation(async (id: string, dto: unknown) => {
      calls.push(
        `patch:${String((dto as { targetExecutionState?: string }).targetExecutionState)}`,
      );
      return { id } as unknown as PostDocument;
    });
  return { calls, fileQueue, patch, post, prisma, service };
}

function youtubePost(overrides: Partial<PostDocument> = {}): PostDocument {
  return {
    brandId: 'brand-a',
    credential: { id: 'credential-a', platform: CredentialPlatform.YOUTUBE },
    description: 'A response',
    id: 'post-a',
    ingredients: [{ id: 'ingredient-a' }],
    label: 'Title',
    organizationId: 'org-a',
    tags: [],
    userId: 'user-a',
    ...overrides,
  } as unknown as PostDocument;
}

describe('PostsService.handleYoutubePost breakout dispatch admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads an ordinary post after the dispatch fence passed it untouched', async () => {
    const h = makeService(null);
    await h.service.handleYoutubePost(youtubePost());
    expect(assertBreakoutPublicationDispatch).toHaveBeenCalledWith(h.prisma, {
      organizationId: 'org-a',
      postId: 'post-a',
    });
    // The ordinary post read nothing but its own breakout link.
    expect(h.post.findFirst).toHaveBeenCalledOnce();
    expect(h.calls).toEqual([
      `patch:${TargetExecutionState.PUBLISHING}`,
      'upload',
    ]);
    expect(h.fileQueue.uploadYoutube).toHaveBeenCalledOnce();
  });

  it('admits a breakout upload before any state write or job and uploads once admitted', async () => {
    const h = makeService('output-a');
    const order: string[] = [];
    vi.mocked(assertBreakoutPublicationDispatch).mockImplementationOnce(
      async () => {
        order.push('admit');
      },
    );
    h.patch.mockImplementationOnce(async (id: string) => {
      order.push('patch');
      return { id } as unknown as PostDocument;
    });
    h.fileQueue.uploadYoutube.mockImplementationOnce(async () => {
      order.push('upload');
      return { jobId: 'job-1' };
    });
    await h.service.handleYoutubePost(youtubePost());
    expect(order).toEqual(['admit', 'patch', 'upload']);
  });

  it('holds a breakout upload without writing PUBLISHING or enqueueing the provider job', async () => {
    const h = makeService('output-a');
    vi.mocked(assertBreakoutPublicationDispatch).mockRejectedValueOnce(
      new BusinessLogicException('Breakout publication held: source_changed'),
    );
    await expect(h.service.handleYoutubePost(youtubePost())).rejects.toThrow(
      'Breakout publication held: source_changed',
    );
    expect(h.patch).not.toHaveBeenCalled();
    expect(h.fileQueue.uploadYoutube).not.toHaveBeenCalled();
  });

  it('fails closed on an infrastructure error instead of uploading', async () => {
    const h = makeService('output-a');
    vi.mocked(assertBreakoutPublicationDispatch).mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(h.service.handleYoutubePost(youtubePost())).rejects.toThrow(
      'database unavailable',
    );
    expect(h.patch).not.toHaveBeenCalled();
    expect(h.fileQueue.uploadYoutube).not.toHaveBeenCalled();
  });

  it('does not admit a post that the upload never targets', async () => {
    const h = makeService('output-a');
    await h.service.handleYoutubePost(
      youtubePost({
        credential: {
          id: 'credential-b',
          platform: CredentialPlatform.TWITTER,
        },
      } as unknown as Partial<PostDocument>),
    );
    expect(assertBreakoutPublicationDispatch).not.toHaveBeenCalled();
    expect(h.fileQueue.uploadYoutube).not.toHaveBeenCalled();
  });
});
