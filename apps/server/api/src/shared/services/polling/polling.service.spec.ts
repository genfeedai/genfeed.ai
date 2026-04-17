import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import {
  PollingService,
  PollingTimeoutError,
} from '@api/shared/services/polling/polling.service';
import { IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

describe('PollingService', () => {
  let service: PollingService;
  let mockIngredientsService: vi.Mocked<IngredientsService>;
  let mockLogger: vi.Mocked<LoggerService>;

  const mockIngredientId = 'test-object-id'.toHexString();

  const asIngredientDocument = (value: unknown): IngredientDocument =>
    value as IngredientDocument;
  const getIngredientId = (query: Record<string, unknown>): string =>
    query._id as string;

  const createMockIngredient = (
    status: IngredientStatus = IngredientStatus.PROCESSING,
    id = mockIngredientId,
  ) =>
    ({
      _id: id,
      isDeleted: false,
      name: 'Test Ingredient',
      status,
    }) as unknown as IngredientDocument;

  beforeEach(async () => {
    mockIngredientsService = {
      findOne: vi.fn(),
    } as unknown as vi.Mocked<IngredientsService>;

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PollingService,
        {
          provide: IngredientsService,
          useValue: mockIngredientsService,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<PollingService>(PollingService);

    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('PollingTimeoutError', () => {
    it('should create error with correct properties', () => {
      const error = new PollingTimeoutError(
        'Test timeout message',
        mockIngredientId,
        5000,
      );

      expect(error.name).toBe('PollingTimeoutError');
      expect(error.message).toBe('Test timeout message');
      expect(error.ingredientId).toBe(mockIngredientId);
      expect(error.timeoutMs).toBe(5000);
    });
  });

  describe('waitForIngredientCompletion', () => {
    it('should return immediately if ingredient is GENERATED', async () => {
      const generatedIngredient = createMockIngredient(
        IngredientStatus.GENERATED,
      );
      mockIngredientsService.findOne.mockResolvedValue(
        asIngredientDocument(generatedIngredient),
      );

      const promise = service.waitForIngredientCompletion(
        mockIngredientId,
        5000,
        100,
      );

      await vi.advanceTimersByTimeAsync(0);
      const result = await promise;

      expect(result).toEqual(generatedIngredient);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Starting ingredient polling',
        expect.objectContaining({
          ingredientId: mockIngredientId,
          pollIntervalMs: 100,
          timeoutMs: 5000,
        }),
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        'Ingredient polling completed',
        expect.objectContaining({
          ingredientId: mockIngredientId,
          status: IngredientStatus.GENERATED,
        }),
      );
    });

    it('should return immediately if ingredient is FAILED', async () => {
      const failedIngredient = createMockIngredient(IngredientStatus.FAILED);
      mockIngredientsService.findOne.mockResolvedValue(
        asIngredientDocument(failedIngredient),
      );

      const promise = service.waitForIngredientCompletion(
        mockIngredientId,
        5000,
        100,
      );

      await vi.advanceTimersByTimeAsync(0);
      const result = await promise;

      expect(result).toEqual(failedIngredient);
      expect(result.status).toBe(IngredientStatus.FAILED);
    });

    it('should poll until ingredient completes', async () => {
      const generatingIngredient = createMockIngredient(
        IngredientStatus.PROCESSING,
      );
      const generatedIngredient = createMockIngredient(
        IngredientStatus.GENERATED,
      );

      mockIngredientsService.findOne
        .mockResolvedValueOnce(asIngredientDocument(generatingIngredient))
        .mockResolvedValueOnce(asIngredientDocument(generatingIngredient))
        .mockResolvedValueOnce(asIngredientDocument(generatedIngredient));

      const promise = service.waitForIngredientCompletion(
        mockIngredientId,
        5000,
        100,
      );

      // First poll - still generating
      await vi.advanceTimersByTimeAsync(0);
      // Wait for poll interval
      await vi.advanceTimersByTimeAsync(100);
      // Second poll - still generating
      await vi.advanceTimersByTimeAsync(100);
      // Third poll - completed

      const result = await promise;

      expect(result.status).toBe(IngredientStatus.GENERATED);
      expect(mockIngredientsService.findOne).toHaveBeenCalledTimes(3);
    });

    it('should throw HttpException if ingredient not found', async () => {
      mockIngredientsService.findOne.mockResolvedValue(null);

      const promise = service.waitForIngredientCompletion(
        mockIngredientId,
        5000,
        100,
      );

      // Attach rejection handlers before advancing timers to avoid unhandled rejection
      const assertThrow = expect(promise).rejects.toThrow(HttpException);
      const assertMatch = expect(promise).rejects.toMatchObject({
        response: {
          detail: expect.stringContaining(mockIngredientId),
          title: 'Ingredient not found',
        },
        status: HttpStatus.NOT_FOUND,
      });

      await vi.advanceTimersByTimeAsync(0);
      await assertThrow;
      await assertMatch;
    });

    it('should throw PollingTimeoutError when timeout reached', async () => {
      const generatingIngredient = createMockIngredient(
        IngredientStatus.PROCESSING,
      );
      mockIngredientsService.findOne.mockResolvedValue(
        asIngredientDocument(generatingIngredient),
      );

      const promise = service.waitForIngredientCompletion(
        mockIngredientId,
        500,
        100,
      );

      // Attach rejection handlers before advancing timers to avoid unhandled rejection
      const assertThrow = expect(promise).rejects.toThrow(PollingTimeoutError);
      const assertMatch = expect(promise).rejects.toMatchObject({
        ingredientId: mockIngredientId,
        timeoutMs: 500,
      });

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(600);
      await assertThrow;
      await assertMatch;

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Ingredient polling timeout',
        expect.objectContaining({
          ingredientId: mockIngredientId,
          timeoutMs: 500,
        }),
      );
    });

    it('should pass populate options to findOne', async () => {
      const generatedIngredient = createMockIngredient(
        IngredientStatus.GENERATED,
      );
      mockIngredientsService.findOne.mockResolvedValue(
        asIngredientDocument(generatedIngredient),
      );

      const populateOptions = [{ path: 'model' }, { path: 'user' }];

      const promise = service.waitForIngredientCompletion(
        mockIngredientId,
        5000,
        100,
        populateOptions,
      );

      await vi.advanceTimersByTimeAsync(0);
      await promise;

      expect(mockIngredientsService.findOne).toHaveBeenCalledWith(
        { _id: mockIngredientId },
        populateOptions,
      );
    });

    it('should throw HttpException if ingredient disappears during timeout', async () => {
      const generatingIngredient = createMockIngredient(
        IngredientStatus.PROCESSING,
      );

      mockIngredientsService.findOne
        .mockResolvedValueOnce(asIngredientDocument(generatingIngredient))
        .mockResolvedValue(null); // Disappears after first poll

      const promise = service.waitForIngredientCompletion(
        mockIngredientId,
        500,
        100,
      );

      // Attach handler before advancing timers to avoid unhandled rejection
      const assertion = expect(promise).rejects.toThrow(HttpException);

      // First poll - exists
      await vi.advanceTimersByTimeAsync(0);
      // Wait for interval
      await vi.advanceTimersByTimeAsync(100);

      await assertion;
    });
  });

  describe('waitForMultipleIngredientsCompletion', () => {
    const mockIds = [
      'test-object-id'.toHexString(),
      'test-object-id'.toHexString(),
      'test-object-id'.toHexString(),
    ];

    it('should return all ingredients when all complete immediately', async () => {
      const ingredients = mockIds.map((id) =>
        createMockIngredient(IngredientStatus.GENERATED, id),
      );

      mockIngredientsService.findOne.mockImplementation(
        (query: Record<string, unknown>) => {
          const id = getIngredientId(query);
          return Promise.resolve(
            ingredients.find(
              (i) => i._id.toString() === id,
            ) as IngredientDocument,
          );
        },
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        mockIds,
        5000,
        100,
      );

      await vi.advanceTimersByTimeAsync(0);
      const result = await promise;

      expect(result).toHaveLength(3);
      expect(result.every((i) => i.status === IngredientStatus.GENERATED)).toBe(
        true,
      );
    });

    it('should poll until all ingredients complete', async () => {
      const createIngredientWithStatus = (
        id: string,
        status: IngredientStatus,
      ) => createMockIngredient(status, id);

      let callCount = 0;
      mockIngredientsService.findOne.mockImplementation(
        (query: Record<string, unknown>) => {
          callCount++;
          const id = getIngredientId(query);
          const index = mockIds.indexOf(id);

          // First poll: all generating
          // Second poll: first completed
          // Third poll: all completed
          if (callCount <= mockIds.length) {
            return Promise.resolve(
              createIngredientWithStatus(id, IngredientStatus.PROCESSING),
            );
          } else if (callCount <= mockIds.length * 2) {
            if (index === 0) {
              return Promise.resolve(
                createIngredientWithStatus(id, IngredientStatus.GENERATED),
              );
            }
            return Promise.resolve(
              createIngredientWithStatus(id, IngredientStatus.PROCESSING),
            );
          } else {
            return Promise.resolve(
              createIngredientWithStatus(id, IngredientStatus.GENERATED),
            );
          }
        },
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        mockIds,
        5000,
        100,
      );

      // First poll
      await vi.advanceTimersByTimeAsync(0);
      // Wait for interval
      await vi.advanceTimersByTimeAsync(100);
      // Second poll
      await vi.advanceTimersByTimeAsync(100);
      // Third poll

      const result = await promise;

      expect(result).toHaveLength(3);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'All ingredients polling completed',
        expect.objectContaining({
          count: 3,
        }),
      );
    });

    it('should throw HttpException if any ingredient not found', async () => {
      mockIngredientsService.findOne.mockImplementation(
        (query: Record<string, unknown>) => {
          const id = getIngredientId(query);
          if (id === mockIds[1]) {
            return Promise.resolve(null);
          }
          return Promise.resolve(
            createMockIngredient(IngredientStatus.PROCESSING, id),
          );
        },
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        mockIds,
        5000,
        100,
      );

      // Attach handler before advancing timers to avoid unhandled rejection
      const assertion = expect(promise).rejects.toThrow(HttpException);
      await vi.advanceTimersByTimeAsync(0);
      await assertion;
    });

    it('should handle mixed success and failure statuses', async () => {
      const statuses = [
        IngredientStatus.GENERATED,
        IngredientStatus.FAILED,
        IngredientStatus.GENERATED,
      ];

      mockIngredientsService.findOne.mockImplementation(
        (query: Record<string, unknown>) => {
          const id = getIngredientId(query);
          const index = mockIds.indexOf(id);
          return Promise.resolve(createMockIngredient(statuses[index], id));
        },
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        mockIds,
        5000,
        100,
      );

      await vi.advanceTimersByTimeAsync(0);
      const result = await promise;

      expect(result).toHaveLength(3);
      expect(result[1].status).toBe(IngredientStatus.FAILED);
    });

    it('should throw PollingTimeoutError with partial results', async () => {
      mockIngredientsService.findOne.mockImplementation(
        (query: Record<string, unknown>) => {
          const id = getIngredientId(query);
          const index = mockIds.indexOf(id);
          // First ingredient completes, others stay generating
          if (index === 0) {
            return Promise.resolve(
              createMockIngredient(IngredientStatus.GENERATED, id),
            );
          }
          return Promise.resolve(
            createMockIngredient(IngredientStatus.PROCESSING, id),
          );
        },
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        mockIds,
        500,
        100,
      );

      // Attach rejection handlers before advancing timers to avoid unhandled rejection
      const assertThrow = expect(promise).rejects.toThrow(PollingTimeoutError);
      const assertMatch = expect(promise).rejects.toMatchObject({
        message: expect.stringContaining('1 of 3'),
      });

      await vi.advanceTimersByTimeAsync(600);
      await assertThrow;
      await assertMatch;

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Multiple ingredient polling timeout',
        expect.objectContaining({
          completed: 1,
          incomplete: 2,
        }),
      );
    });

    it('should throw PollingTimeoutError when none complete', async () => {
      mockIngredientsService.findOne.mockImplementation(
        (query: Record<string, unknown>) => {
          const id = getIngredientId(query);
          return Promise.resolve(
            createMockIngredient(IngredientStatus.PROCESSING, id),
          );
        },
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        mockIds,
        500,
        100,
      );

      // Attach rejection handlers before advancing timers to avoid unhandled rejection
      const assertThrow = expect(promise).rejects.toThrow(PollingTimeoutError);
      const assertMatch = expect(promise).rejects.toMatchObject({
        message: 'No ingredients completed within 500ms',
      });

      await vi.advanceTimersByTimeAsync(600);
      await assertThrow;
      await assertMatch;
    });

    it('should maintain input order in results', async () => {
      // Ingredients complete in reverse order
      let callCount = 0;
      mockIngredientsService.findOne.mockImplementation(
        (query: Record<string, unknown>) => {
          callCount++;
          const id = getIngredientId(query);
          const index = mockIds.indexOf(id);

          // Complete in reverse order: 2, 1, 0
          if (callCount <= mockIds.length) {
            if (index === 2) {
              return Promise.resolve(
                createMockIngredient(IngredientStatus.GENERATED, id),
              );
            }
          } else if (callCount <= mockIds.length * 2) {
            if (index === 2 || index === 1) {
              return Promise.resolve(
                createMockIngredient(IngredientStatus.GENERATED, id),
              );
            }
          } else {
            return Promise.resolve(
              createMockIngredient(IngredientStatus.GENERATED, id),
            );
          }
          return Promise.resolve(
            createMockIngredient(IngredientStatus.PROCESSING, id),
          );
        },
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        mockIds,
        5000,
        100,
      );

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(100);
      // id0 completes on the 4th poll batch (callCount > 6)
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;

      // Results should be in same order as input
      expect(result[0]._id.toString()).toBe(mockIds[0]);
      expect(result[1]._id.toString()).toBe(mockIds[1]);
      expect(result[2]._id.toString()).toBe(mockIds[2]);
    });

    it('should log start of multiple polling', async () => {
      const ingredients = mockIds.map((id) =>
        createMockIngredient(IngredientStatus.GENERATED, id),
      );

      mockIngredientsService.findOne.mockImplementation(
        (query: Record<string, unknown>) => {
          const id = getIngredientId(query);
          return Promise.resolve(
            ingredients.find(
              (i) => i._id.toString() === id,
            ) as IngredientDocument,
          );
        },
      );

      const promise = service.waitForMultipleIngredientsCompletion(
        mockIds,
        5000,
        100,
      );

      await vi.advanceTimersByTimeAsync(0);
      await promise;

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Starting multiple ingredient polling',
        expect.objectContaining({
          count: 3,
          ingredientIds: mockIds,
          pollIntervalMs: 100,
          timeoutMs: 5000,
        }),
      );
    });

    it('should pass populate options to all findOne calls', async () => {
      const ingredients = mockIds.map((id) =>
        createMockIngredient(IngredientStatus.GENERATED, id),
      );

      mockIngredientsService.findOne.mockImplementation(
        (query: Record<string, unknown>) => {
          const id = getIngredientId(query);
          return Promise.resolve(
            ingredients.find(
              (i) => i._id.toString() === id,
            ) as IngredientDocument,
          );
        },
      );

      const populateOptions = [{ path: 'model' }];

      const promise = service.waitForMultipleIngredientsCompletion(
        mockIds,
        5000,
        100,
        populateOptions,
      );

      await vi.advanceTimersByTimeAsync(0);
      await promise;

      expect(mockIngredientsService.findOne).toHaveBeenCalledWith(
        { _id: mockIds[0] },
        populateOptions,
      );
    });
  });
});
