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

describe('VideoGenerationCompletionService', () => {
  let service: VideoGenerationCompletionService;
  let bookmarksService: { addGeneratedIngredient: ReturnType<typeof vi.fn> };
  let cacheService: { invalidateByTags: ReturnType<typeof vi.fn> };
  let cancellationService: { bindCancelOnAbort: ReturnType<typeof vi.fn> };
  let ingredientCompletionService: {
    waitForMultipleIngredientsCompletion: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let videosService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    bookmarksService = {
      addGeneratedIngredient: vi.fn().mockResolvedValue(undefined),
    };
    cacheService = { invalidateByTags: vi.fn().mockResolvedValue(undefined) };
    cancellationService = { bindCancelOnAbort: vi.fn() };
    ingredientCompletionService = {
      waitForMultipleIngredientsCompletion: vi.fn(),
    };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    videosService = { findOne: vi.fn() };

    // Generation-only completion: only bookmarking, cache invalidation,
    // polling, and serialization dependencies remain. A reintroduced music
    // or file-queue dependency here would fail this constructor call and
    // every other test in this suite.
    service = new VideoGenerationCompletionService(
      bookmarksService as unknown as BookmarksService,
      cacheService as unknown as CacheService,
      ingredientCompletionService as unknown as IngredientCompletionService,
      loggerService as unknown as LoggerService,
      videosService as unknown as VideosService,
      cancellationService as unknown as IngredientGenerationCancellationService,
    );
  });

  it('completes generation without starting any music generation or merge job', async () => {
    const context = makeContext();

    const result = await service.complete(context);

    expect(cacheService.invalidateByTags).toHaveBeenCalledWith(['videos']);
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
      } as never,
    });

    await service.complete(context);

    expect(bookmarksService.addGeneratedIngredient).toHaveBeenCalledWith(
      'bookmark-1',
      'video-1',
    );
  });

  it('waits for completion when requested, without any music/merge polling', async () => {
    const completedIngredient = { id: 'video-1', status: 'GENERATED' };
    ingredientCompletionService.waitForMultipleIngredientsCompletion.mockResolvedValue(
      [completedIngredient],
    );
    const context = makeContext({
      createVideoDto: { waitForCompletion: true } as never,
    });

    const result = await service.complete(context);

    expect(cancellationService.bindCancelOnAbort).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'video-1', organizationId: 'org-1' }),
    );
    expect(result).toEqual(completedIngredient);
  });
});
