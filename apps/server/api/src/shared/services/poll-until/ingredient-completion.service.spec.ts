import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import {
  PollAbortException,
  PollTimeoutException,
} from '@api/shared/services/poll-until/poll-until.exception';
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
  const ingredientA = '550e8400-e29b-41d4-a716-446655440001';
  const ingredientB = '550e8400-e29b-41d4-a716-446655440002';
  const ingredientC = '550e8400-e29b-41d4-a716-446655440003';
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
        .mockResolvedValueOnce(
          ingredient(ingredientA, IngredientStatus.PROCESSING),
        )
        .mockResolvedValueOnce(
          ingredient(ingredientA, IngredientStatus.PROCESSING),
        )
        .mockResolvedValue(ingredient(ingredientA, IngredientStatus.GENERATED));

      const promise = service.waitForIngredientCompletion(
        ingredientA,
        60_000,
        100,
      );
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.status).toBe(IngredientStatus.GENERATED);
      expect(ingredientsService.findOne).toHaveBeenCalledTimes(3);
    });

    it('treats FAILED as a terminal status and returns the ingredient', async () => {
      ingredientsService.findOne.mockResolvedValue(
        ingredient(ingredientA, IngredientStatus.FAILED),
      );

      const promise = service.waitForIngredientCompletion(
        ingredientA,
        60_000,
        100,
      );
      await vi.runAllTimersAsync();

      await expect(promise).resolves.toMatchObject({
        status: IngredientStatus.FAILED,
      });
    });

    it('throws PollTimeoutException when the ingredient never completes', async () => {
      ingredientsService.findOne.mockResolvedValue(
        ingredient(ingredientA, IngredientStatus.PROCESSING),
      );

      const promise = service.waitForIngredientCompletion(
        ingredientA,
        300,
        100,
      );
      const expectation =
        expect(promise).rejects.toBeInstanceOf(PollTimeoutException);
      await vi.runAllTimersAsync();
      await expectation;
    });

    it('throws NotFound when the ingredient disappears mid-poll', async () => {
      ingredientsService.findOne.mockResolvedValue(null);

      const promise = service.waitForIngredientCompletion(
        ingredientA,
        60_000,
        100,
      );
      const expectation = expect(promise).rejects.toBeInstanceOf(HttpException);
      await vi.runAllTimersAsync();
      await expectation;
    });

    it('forwards the populate options to the ingredient read', async () => {
      ingredientsService.findOne.mockResolvedValue(
        ingredient(ingredientA, IngredientStatus.GENERATED),
      );
      const populate = [{ path: 'prompt' }] as never;

      const promise = service.waitForIngredientCompletion(
        ingredientA,
        60_000,
        100,
        populate,
      );
      await vi.runAllTimersAsync();
      await promise;

      expect(ingredientsService.findOne).toHaveBeenCalledWith(
        { id: ingredientA },
        populate,
      );
    });

    it('rejects with PollAbortException when the abort signal fires', async () => {
      ingredientsService.findOne.mockResolvedValue(
        ingredient(ingredientA, IngredientStatus.PROCESSING),
      );
      const abort = new AbortController();

      const promise = service.waitForIngredientCompletion(
        ingredientA,
        60_000,
        100,
        [],
        abort.signal,
      );
      abort.abort();
      const expectation =
        expect(promise).rejects.toBeInstanceOf(PollAbortException);
      await vi.runAllTimersAsync();
      await expectation;
    });
  });

  describe('waitForMultipleIngredientsCompletion()', () => {
    it('resolves once every ingredient is terminal, in input order', async () => {
      ingredientsService.findOne.mockImplementation((query: { id: string }) =>
        Promise.resolve(ingredient(query.id, IngredientStatus.GENERATED)),
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        [ingredientA, ingredientB, ingredientC],
        60_000,
        100,
      );
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.map((r) => r.id)).toEqual([
        ingredientA,
        ingredientB,
        ingredientC,
      ]);
    });

    it('keeps polling until the slowest ingredient completes', async () => {
      let attempts = 0;
      ingredientsService.findOne.mockImplementation((query: { id: string }) => {
        // ingredient B stays processing for the first two rounds, then completes.
        if (query.id === ingredientB) {
          attempts++;
          return Promise.resolve(
            ingredient(
              ingredientB,
              attempts >= 3
                ? IngredientStatus.GENERATED
                : IngredientStatus.PROCESSING,
            ),
          );
        }
        return Promise.resolve(
          ingredient(query.id, IngredientStatus.GENERATED),
        );
      });

      const promise = service.waitForMultipleIngredientsCompletion(
        [ingredientA, ingredientB],
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
      expect(
        ingredientsService.findOne.mock.calls.filter(
          ([query]) => query.id === ingredientA,
        ),
      ).toHaveLength(1);
    });

    it('throws PollTimeoutException if any ingredient never completes', async () => {
      ingredientsService.findOne.mockImplementation((query: { id: string }) =>
        Promise.resolve(
          ingredient(
            query.id,
            query.id === ingredientB
              ? IngredientStatus.PROCESSING
              : IngredientStatus.GENERATED,
          ),
        ),
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        [ingredientA, ingredientB],
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
