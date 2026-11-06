import type { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import type { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import type { VideoGenerationContext } from '@api/collections/videos/services/video-generation.types';
import { VideoGenerationCompletionService } from '@api/collections/videos/services/video-generation-completion.service';
import type { VideosService } from '@api/collections/videos/services/videos.service';
import type { CacheService } from '@api/services/cache/cache.service';
import type { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import type { LoggerService } from '@libs/logger/logger.service';

// Background music used to be started from here via a
// `VideoMusicOrchestrationService` dependency this service no longer takes.
// Stubbing the JSON:API serializer keeps this suite on that removal instead
// of on the real serializer's field requirements.
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => data,
  ),
}));

function makeContext(
  overrides: Partial<VideoGenerationContext> = {},
): VideoGenerationContext {
  return {
    abortSignal: new AbortController().signal,
    createVideoDto: { waitForCompletion: false },
    ingredientData: { id: 'video-1' },
    pendingIngredientIds: ['video-1'],
    request: {},
    user: { organizationId: 'org-1', userId: 'user-1' },
    ...overrides,
  } as unknown as VideoGenerationContext;
}

type CancelledIngredient = { id: string; organizationId: string };

describe('VideoGenerationCompletionService', () => {
  let service: VideoGenerationCompletionService;
  // Observable effects of completion, recorded by stateful fakes.
  let bookmarkLinks: string[];
  let cancelled: CancelledIngredient[];
  let invalidatedTags: string[];
  let completedIngredients: unknown[];
  let clientAbort: AbortController;

  beforeEach(() => {
    bookmarkLinks = [];
    cancelled = [];
    invalidatedTags = [];
    completedIngredients = [];
    clientAbort = new AbortController();

    const bookmarksService = {
      addGeneratedIngredient: async (
        bookmarkId: string,
        ingredientId: string,
        organizationId: string,
      ) => {
        bookmarkLinks.push(`${organizationId}/${bookmarkId}/${ingredientId}`);
      },
    };
    const cacheService = {
      invalidateByTags: async (tags: string[]) => {
        invalidatedTags.push(...tags);
      },
    };
    // Same contract as the real service: cancel once the request aborts.
    const cancellationService = {
      bindCancelOnAbort: (
        input: CancelledIngredient & { abortSignal: AbortSignal },
      ) => {
        input.abortSignal.addEventListener(
          'abort',
          () =>
            cancelled.push({
              id: input.id,
              organizationId: input.organizationId,
            }),
          { once: true },
        );
      },
    };
    const ingredientCompletionService = {
      waitForMultipleIngredientsCompletion: async () => completedIngredients,
    };
    const loggerService = {
      error: () => undefined,
      log: () => undefined,
      warn: () => undefined,
    };

    // Generation-only completion: only bookmarking, cache invalidation,
    // polling, and serialization dependencies remain. A reintroduced music
    // or file-queue dependency here would fail this constructor call and
    // every other test in this suite.
    service = new VideoGenerationCompletionService(
      bookmarksService as unknown as BookmarksService,
      cacheService as unknown as CacheService,
      ingredientCompletionService as unknown as IngredientCompletionService,
      loggerService as unknown as LoggerService,
      {} as unknown as VideosService,
      cancellationService as unknown as IngredientGenerationCancellationService,
    );
  });

  it('completes generation without starting any music generation or merge job', async () => {
    const result = await service.complete(makeContext());

    expect(invalidatedTags).toEqual(['videos']);
    expect(result).toMatchObject({
      id: 'video-1',
      pendingIngredientIds: ['video-1'],
    });
  });

  it('links a bookmark when requested, independent of the removed music flow', async () => {
    const context = makeContext({
      createVideoDto: {
        bookmark: 'bookmark-1',
        waitForCompletion: false,
      } as VideoGenerationContext['createVideoDto'],
    });

    await service.complete(context);

    expect(bookmarkLinks).toEqual(['org-1/bookmark-1/video-1']);
  });

  it('waits for completion when requested, without any music/merge polling', async () => {
    const completedIngredient = { id: 'video-1', status: 'GENERATED' };
    completedIngredients = [completedIngredient];
    const context = makeContext({
      abortSignal: clientAbort.signal,
      createVideoDto: {
        waitForCompletion: true,
      } as VideoGenerationContext['createVideoDto'],
    });

    const result = await service.complete(context);

    expect(result).toEqual(completedIngredient);
    expect(cancelled).toEqual([]);
  });

  it('cancels the processing video when the client aborts while waiting', async () => {
    const context = makeContext({
      abortSignal: clientAbort.signal,
      createVideoDto: {
        waitForCompletion: true,
      } as VideoGenerationContext['createVideoDto'],
    });

    await service.complete(context);
    clientAbort.abort();

    expect(cancelled).toEqual([{ id: 'video-1', organizationId: 'org-1' }]);
  });
});
