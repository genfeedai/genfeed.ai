import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

/**
 * Exercises the adapter through the REAL {@link PollUntilService} engine so the
 * ingredient completion semantics (terminal-status detection, not-found,
 * timeout translation) are verified end-to-end, not against a mocked loop.
 */
describe('IngredientCompletionService', () => {
  let service: IngredientCompletionService;
  let ingredientsService: { findOne: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    ingredientsService = { findOne: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientCompletionService,
        PollUntilService,
        { provide: IngredientsService, useValue: ingredientsService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<IngredientCompletionService>(
      IngredientCompletionService,
    );
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const ingredient = (id: string, status: IngredientStatus) => ({
    id,
    status,
  });

  describe('waitForIngredientCompletion()', () => {
    it('resolves once the ingredient reaches a terminal status', async () => {
      ingredientsService.findOne
        .mockResolvedValueOnce(ingredient('ing-1', IngredientStatus.PROCESSING))
        .mockResolvedValueOnce(ingredient('ing-1', IngredientStatus.PROCESSING))
        .mockResolvedValue(ingredient('ing-1', IngredientStatus.GENERATED));

      const promise = service.waitForIngredientCompletion('ing-1', 60_000, 100);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.status).toBe(IngredientStatus.GENERATED);
      expect(ingredientsService.findOne).toHaveBeenCalledTimes(3);
    });

    it('treats FAILED as a terminal status and returns the ingredient', async () => {
      ingredientsService.findOne.mockResolvedValue(
        ingredient('ing-1', IngredientStatus.FAILED),
      );

      const promise = service.waitForIngredientCompletion('ing-1', 60_000, 100);
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toMatchObject({
        status: IngredientStatus.FAILED,
      });
    });

    it('throws PollTimeoutException when the ingredient never completes', async () => {
      ingredientsService.findOne.mockResolvedValue(
        ingredient('ing-1', IngredientStatus.PROCESSING),
      );

      const promise = service.waitForIngredientCompletion('ing-1', 300, 100);
      const expectation =
        expect(promise).rejects.toBeInstanceOf(PollTimeoutException);
      await vi.runAllTimersAsync();
      await expectation;
    });

    it('throws NotFound when the ingredient disappears mid-poll', async () => {
      ingredientsService.findOne.mockResolvedValue(null);

      const promise = service.waitForIngredientCompletion('ing-1', 60_000, 100);
      const expectation = expect(promise).rejects.toBeInstanceOf(HttpException);
      await vi.runAllTimersAsync();
      await expectation;
    });

    it('forwards the populate options to the ingredient read', async () => {
      ingredientsService.findOne.mockResolvedValue(
        ingredient('ing-1', IngredientStatus.GENERATED),
      );
      const populate = [{ path: 'prompt' }] as never;

      const promise = service.waitForIngredientCompletion(
        'ing-1',
        60_000,
        100,
        populate,
      );
      await vi.runAllTimersAsync();
      await promise;

      expect(ingredientsService.findOne).toHaveBeenCalledWith(
        { _id: 'ing-1' },
        populate,
      );
    });
  });

  describe('waitForMultipleIngredientsCompletion()', () => {
    it('resolves once every ingredient is terminal, in input order', async () => {
      ingredientsService.findOne.mockImplementation((query: { _id: string }) =>
        Promise.resolve(ingredient(query._id, IngredientStatus.GENERATED)),
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        ['a', 'b', 'c'],
        60_000,
        100,
      );
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });

    it('keeps polling until the slowest ingredient completes', async () => {
      let attempts = 0;
      ingredientsService.findOne.mockImplementation(
        (query: { _id: string }) => {
          // 'b' stays processing for the first two rounds, then completes.
          if (query._id === 'b') {
            attempts++;
            return Promise.resolve(
              ingredient(
                'b',
                attempts >= 3
                  ? IngredientStatus.GENERATED
                  : IngredientStatus.PROCESSING,
              ),
            );
          }
          return Promise.resolve(
            ingredient(query._id, IngredientStatus.GENERATED),
          );
        },
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        ['a', 'b'],
        60_000,
        100,
      );
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.map((r) => r.status)).toEqual([
        IngredientStatus.GENERATED,
        IngredientStatus.GENERATED,
      ]);
      expect(attempts).toBeGreaterThanOrEqual(3);
    });

    it('throws PollTimeoutException if any ingredient never completes', async () => {
      ingredientsService.findOne.mockImplementation((query: { _id: string }) =>
        Promise.resolve(
          ingredient(
            query._id,
            query._id === 'b'
              ? IngredientStatus.PROCESSING
              : IngredientStatus.GENERATED,
          ),
        ),
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        ['a', 'b'],
        300,
        100,
      );
      const expectation =
        expect(promise).rejects.toBeInstanceOf(PollTimeoutException);
      await vi.runAllTimersAsync();
      await expectation;
    });
  });
});
