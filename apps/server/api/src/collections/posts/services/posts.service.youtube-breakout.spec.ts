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

/**
 * Everything that crossed a boundary, in order: the dispatch fence admitting a
 * post, the post's state writes, and the provider upload job.
 */
const run = vi.hoisted(() => ({
  /**
   * `undefined` runs the real fence, `'admit'` admits the breakout post, and
   * an error makes the fence hold it.
   */
  fenceOutcome: undefined as Error | 'admit' | undefined,
  timeline: [] as string[],
}));

// The dispatch fence is the unit under integration here: keep its real
// behavior for an ordinary post and let each breakout case choose the outcome.
vi.mock(
  '@api/collections/outliers/services/breakout-publication-fence.util',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@api/collections/outliers/services/breakout-publication-fence.util')
      >();
    return {
      ...actual,
      assertBreakoutPublicationDispatch: async (
        ...args: Parameters<typeof actual.assertBreakoutPublicationDispatch>
      ) => {
        const [, { organizationId, postId }] = args;
        run.timeline.push(`admit:${organizationId}/${postId}`);
        if (run.fenceOutcome === 'admit') return;
        if (run.fenceOutcome) throw run.fenceOutcome;
        await actual.assertBreakoutPublicationDispatch(...args);
      },
    };
  },
);

const logger = {
  debug: () => undefined,
  error: () => undefined,
  log: () => undefined,
  warn: () => undefined,
} as unknown as LoggerService;

function makeService(breakoutOutputId: string | null = null) {
  const post = {
    findFirst: async () => {
      run.timeline.push('read:breakout-link');
      return { breakoutOutputId };
    },
  };
  const prisma = {
    $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({ post }),
    post,
  } as unknown as PrismaService;
  const fileQueue = {
    uploadYoutube: async (job: { postId: string }) => {
      run.timeline.push(`upload:${job.postId}`);
      return { jobId: 'job-1' };
    },
  } as unknown as FileQueueService;
  const service = new PostsService(
    prisma,
    logger,
    { completeMissions: async () => undefined } as never,
    undefined,
    fileQueue,
  );
  // The post row itself is out of scope: record the state written to it.
  service.patch = async (id: string, dto: unknown) => {
    run.timeline.push(
      `patch:${String((dto as { targetExecutionState?: string }).targetExecutionState)}`,
    );
    return { id } as unknown as PostDocument;
  };
  return { service };
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
    run.fenceOutcome = undefined;
    run.timeline = [];
  });

  it('uploads an ordinary post after the dispatch fence passed it untouched', async () => {
    const { service } = makeService(null);

    await service.handleYoutubePost(youtubePost());

    // The ordinary post read nothing but its own breakout link.
    expect(run.timeline).toEqual([
      'admit:org-a/post-a',
      'read:breakout-link',
      `patch:${TargetExecutionState.PUBLISHING}`,
      'upload:post-a',
    ]);
  });

  it('admits a breakout upload before any state write or job and uploads once admitted', async () => {
    const { service } = makeService('output-a');
    run.fenceOutcome = 'admit';

    await service.handleYoutubePost(youtubePost());

    expect(run.timeline).toEqual([
      'admit:org-a/post-a',
      `patch:${TargetExecutionState.PUBLISHING}`,
      'upload:post-a',
    ]);
  });

  it('holds a breakout upload without writing PUBLISHING or enqueueing the provider job', async () => {
    const { service } = makeService('output-a');
    run.fenceOutcome = new BusinessLogicException(
      'Breakout publication held: source_changed',
    );

    await expect(service.handleYoutubePost(youtubePost())).rejects.toThrow(
      'Breakout publication held: source_changed',
    );
    expect(run.timeline).toEqual(['admit:org-a/post-a']);
  });

  it('fails closed on an infrastructure error instead of uploading', async () => {
    const { service } = makeService('output-a');
    run.fenceOutcome = new Error('database unavailable');

    await expect(service.handleYoutubePost(youtubePost())).rejects.toThrow(
      'database unavailable',
    );
    expect(run.timeline).toEqual(['admit:org-a/post-a']);
  });

  it('does not admit a post that the upload never targets', async () => {
    const { service } = makeService('output-a');

    await service.handleYoutubePost(
      youtubePost({
        credential: {
          id: 'credential-b',
          platform: CredentialPlatform.TWITTER,
        },
      } as unknown as Partial<PostDocument>),
    );

    expect(run.timeline).toEqual([]);
  });
});
