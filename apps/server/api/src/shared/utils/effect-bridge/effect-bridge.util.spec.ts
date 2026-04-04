import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Effect } from 'effect';
import {
  EffectServiceError,
  failBadRequest,
  failNotFound,
  promiseToEffect,
  runEffectAsPromise,
  trySync,
} from './effect-bridge.util';

describe('effect-bridge.util', () => {
  describe('runEffectAsPromise', () => {
    it('should return the value for a successful Effect', async () => {
      const effect = Effect.succeed(42);
      const result = await runEffectAsPromise(effect);
      expect(result).toBe(42);
    });

    it('should return complex objects for successful Effects', async () => {
      const data = { id: '123', name: 'test' };
      const effect = Effect.succeed(data);
      const result = await runEffectAsPromise(effect);
      expect(result).toEqual(data);
    });

    it('should throw NotFoundException for EffectServiceError with status 404', async () => {
      const effect = Effect.fail(
        new EffectServiceError({
          code: 'NOT_FOUND',
          message: 'Thread not found',
          status: 404,
        }),
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        NotFoundException,
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        'Thread not found',
      );
    });

    it('should throw BadRequestException for EffectServiceError with status 400', async () => {
      const effect = Effect.fail(
        new EffectServiceError({
          code: 'BAD_REQUEST',
          message: 'Invalid input',
          status: 400,
        }),
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        BadRequestException,
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow('Invalid input');
    });

    it('should throw InternalServerErrorException for EffectServiceError without status', async () => {
      const effect = Effect.fail(
        new EffectServiceError({
          message: 'Something went wrong',
        }),
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should re-throw HttpException as-is when it is the cause', async () => {
      const nestError = new NotFoundException('Already a NestJS error');
      const effect = Effect.fail(nestError);
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        NotFoundException,
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        'Already a NestJS error',
      );
    });

    it('should wrap plain Error into InternalServerErrorException', async () => {
      const effect = Effect.fail(new Error('raw error'));
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow('raw error');
    });

    it('should wrap non-Error failures into InternalServerErrorException', async () => {
      const effect = Effect.fail('string-error');
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should handle Effect.gen pipelines', async () => {
      const effect = Effect.gen(function* () {
        const a = yield* Effect.succeed(10);
        const b = yield* Effect.succeed(20);
        return a + b;
      });
      const result = await runEffectAsPromise(effect);
      expect(result).toBe(30);
    });

    it('should handle Effect.gen pipelines that fail midway', async () => {
      const effect = Effect.gen(function* () {
        yield* Effect.succeed(10);
        return yield* Effect.fail(
          new EffectServiceError({
            message: 'Step 2 failed',
            status: 400,
          }),
        );
      });
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('promiseToEffect', () => {
    it('should wrap a resolved Promise as a succeeded Effect', async () => {
      const effect = promiseToEffect(() => Promise.resolve('hello'));
      const result = await runEffectAsPromise(effect);
      expect(result).toBe('hello');
    });

    it('should wrap a rejected Promise as a failed Effect with EffectServiceError', async () => {
      const effect = promiseToEffect(
        () => Promise.reject(new Error('db error')),
        'Query failed',
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow('Query failed');
    });

    it('should use the original error message when no custom message is provided', async () => {
      const effect = promiseToEffect(() =>
        Promise.reject(new Error('original message')),
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        'original message',
      );
    });

    it('should handle non-Error rejection values', async () => {
      const effect = promiseToEffect(
        () => Promise.reject('string rejection'),
        'Custom message',
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        'Custom message',
      );
    });

    it('should compose with Effect.flatMap', async () => {
      const effect = promiseToEffect(() => Promise.resolve(5)).pipe(
        Effect.flatMap((n) =>
          n > 3
            ? Effect.succeed(n * 2)
            : Effect.fail(
                new EffectServiceError({ message: 'Too small', status: 400 }),
              ),
        ),
      );
      const result = await runEffectAsPromise(effect);
      expect(result).toBe(10);
    });

    it('should compose with Effect.map', async () => {
      const effect = promiseToEffect(() => Promise.resolve({ count: 3 })).pipe(
        Effect.map((data) => data.count),
      );
      const result = await runEffectAsPromise(effect);
      expect(result).toBe(3);
    });
  });

  describe('trySync', () => {
    it('should wrap a successful sync operation', async () => {
      const effect = trySync(() => JSON.parse('{"a":1}'));
      const result = await runEffectAsPromise(effect);
      expect(result).toEqual({ a: 1 });
    });

    it('should capture a throwing sync operation as EffectServiceError', async () => {
      const effect = trySync(() => JSON.parse('invalid json'), 'Parse failed');
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow('Parse failed');
    });

    it('should use the original error message when no custom message is given', async () => {
      const effect = trySync(() => {
        throw new Error('native throw');
      });
      await expect(runEffectAsPromise(effect)).rejects.toThrow('native throw');
    });
  });

  describe('failNotFound', () => {
    it('should create a not-found failure with entity and id', async () => {
      const effect = failNotFound('Thread', '123');
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        NotFoundException,
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        'Thread 123 not found',
      );
    });

    it('should create a not-found failure with entity only', async () => {
      const effect = failNotFound('Thread');
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        NotFoundException,
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        'Thread not found',
      );
    });
  });

  describe('failBadRequest', () => {
    it('should create a bad-request failure', async () => {
      const effect = failBadRequest('Invalid thread status');
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        BadRequestException,
      );
      await expect(runEffectAsPromise(effect)).rejects.toThrow(
        'Invalid thread status',
      );
    });
  });

  describe('integration: Effect.gen pipeline with mixed helpers', () => {
    it('should compose promiseToEffect, trySync, and failNotFound', async () => {
      const findDoc = promiseToEffect<{ id: string; data: string } | null>(() =>
        Promise.resolve({ data: '{"value":42}', id: '1' }),
      );

      const pipeline = Effect.gen(function* () {
        const doc = yield* findDoc;
        if (!doc) {
          return yield* failNotFound('Document');
        }
        const parsed = yield* trySync(
          () => JSON.parse(doc.data) as { value: number },
        );
        return { id: doc.id, value: parsed.value };
      });

      const result = await runEffectAsPromise(pipeline);
      expect(result).toEqual({ id: '1', value: 42 });
    });

    it('should fail when document is null', async () => {
      const findDoc = promiseToEffect<null>(() => Promise.resolve(null));

      const pipeline = Effect.gen(function* () {
        const doc = yield* findDoc;
        if (!doc) {
          return yield* failNotFound('Document', 'abc');
        }
        return doc;
      });

      await expect(runEffectAsPromise(pipeline)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
