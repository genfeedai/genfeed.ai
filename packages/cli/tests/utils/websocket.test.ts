import { IngredientStatus } from '@genfeedai/contracts';
import type { IBackgroundTaskUpdatePayload } from '@genfeedai/contracts/interfaces';
import type { Ora } from 'ora';
import { io } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Image } from '@/api/images';
import { ApiError, AuthError } from '@/utils/errors';
import { createWebSocketConnection, waitForCompletion } from '@/utils/websocket';

type Observation = Pick<Image, 'id' | 'status' | 'error'>;
const handlers = new Map<string, (data?: unknown) => void>();
const mockSocket = {
  disconnect: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
};
vi.mock('socket.io-client', () => ({ io: vi.fn(() => mockSocket) }));

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

const processing: Observation = { id: 'media-1', status: IngredientStatus.PROCESSING };
const generated: Observation = { id: 'media-1', status: IngredientStatus.GENERATED };

function emitUpdate(overrides: Partial<IBackgroundTaskUpdatePayload> = {}): void {
  handlers.get('background-task-update')?.({
    resultId: 'media-1',
    resultType: 'IMAGE',
    status: 'completed',
    taskId: 'task-1',
    timestamp: '2026-09-14T00:00:00Z',
    userId: 'user-1',
    ...overrides,
  });
}

function start(getResult: (signal: AbortSignal) => Promise<Observation>, spinner?: Ora) {
  return waitForCompletion({
    getResult,
    spinner,
    taskId: 'media-1',
    taskType: 'IMAGE',
    timeout: 10000,
  });
}

describe('utils/websocket', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    handlers.clear();
    mockSocket.on.mockImplementation((event: string, handler: (data?: unknown) => void) => {
      handlers.set(event, handler);
      return mockSocket;
    });
    mockSocket.removeAllListeners.mockImplementation(() => handlers.clear());
    const store = await import('../../src/config/store');
    vi.spyOn(store, 'getApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(store, 'getApiUrl').mockResolvedValue('https://api.genfeed.ai/v1');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('waitForCompletion', () => {
    it.each([IngredientStatus.GENERATED, IngredientStatus.UPLOADED, IngredientStatus.VALIDATED])(
      'returns existing %s media before opening a socket',
      async (status) => {
        const getResult = vi.fn().mockResolvedValue({ ...generated, status });
        const result = await start(getResult);
        expect(result.result).toEqual({ ...generated, status });
        expect(getResult).toHaveBeenCalledTimes(1);
        expect(io).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      }
    );

    it('recovers a missed completion event by polling the original media', async () => {
      const getResult = vi.fn().mockResolvedValueOnce(processing).mockResolvedValue(generated);
      const promise = start(getResult);
      await flushMicrotasks();
      expect(getResult).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect((await promise).result).toEqual(generated);
      expect(getResult).toHaveBeenCalledTimes(2);
      expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
      expect(handlers.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(20000);
      expect(getResult).toHaveBeenCalledTimes(2);
    });

    it.each(['connect', 'connect_error', 'disconnect'])(
      'continues reading durable state after %s',
      async (event) => {
        const getResult = vi.fn().mockResolvedValueOnce(processing).mockResolvedValue(generated);
        const promise = start(getResult);
        await flushMicrotasks();
        handlers.get(event)?.(event === 'disconnect' ? 'transport close' : new Error('offline'));
        await vi.advanceTimersByTimeAsync(2000);
        expect((await promise).result).toEqual(generated);
      }
    );

    it('observes immediately after reconnect', async () => {
      const getResult = vi.fn().mockResolvedValue(processing);
      const startedAt = Date.now();
      const promise = start(getResult);
      await flushMicrotasks();
      handlers.get('connect')?.();
      await flushMicrotasks();
      handlers.get('disconnect')?.('transport close');
      getResult.mockResolvedValue(generated);
      handlers.get('connect')?.();
      expect((await promise).result).toEqual(generated);
      expect(Date.now()).toBe(startedAt);
    });

    it.each(['completed', 'failed'] as const)('treats stale %s events as hints', async (status) => {
      const getResult = vi.fn().mockResolvedValue(processing);
      const settled = vi.fn();
      const promise = start(getResult).then(settled);
      await flushMicrotasks();
      emitUpdate({ status });
      await flushMicrotasks();
      expect(getResult).toHaveBeenCalledTimes(2);
      expect(settled).not.toHaveBeenCalled();
      getResult.mockResolvedValue(generated);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;
      expect(settled).toHaveBeenCalledWith(expect.objectContaining({ result: generated }));
    });

    it('ignores unrelated IDs/types and updates matching progress', async () => {
      const spinner = { text: 'initial' } as Ora;
      const getResult = vi.fn().mockResolvedValue(processing);
      const promise = start(getResult, spinner);
      await flushMicrotasks();
      emitUpdate({ resultId: 'other', taskId: 'other' });
      emitUpdate({ resultType: 'VIDEO' });
      emitUpdate({ progress: 45, status: 'processing' });
      await flushMicrotasks();
      expect(getResult).toHaveBeenCalledTimes(1);
      expect(spinner.text).toContain('45%');
      getResult.mockResolvedValue(generated);
      emitUpdate({ resultId: undefined, taskId: 'media-1' });
      expect((await promise).result).toEqual(generated);
    });

    it('coalesces terminal hints during a read without overlapping GETs', async () => {
      let finishRead: ((value: Observation) => void) | undefined;
      const getResult = vi
        .fn()
        .mockResolvedValueOnce(processing)
        .mockImplementationOnce(
          () =>
            new Promise<Observation>((resolve) => {
              finishRead = resolve;
            })
        )
        .mockResolvedValue(generated);
      const promise = start(getResult);
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(2000);
      emitUpdate();
      emitUpdate();
      handlers.get('connect')?.();
      await vi.advanceTimersByTimeAsync(4000);
      expect(getResult).toHaveBeenCalledTimes(2);
      finishRead?.(processing);
      expect((await promise).result).toEqual(generated);
      expect(getResult).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([IngredientStatus.FAILED, IngredientStatus.REJECTED, IngredientStatus.ARCHIVED])(
      'rejects durable %s with an actionable status command',
      async (status) => {
        const promise = start(vi.fn().mockResolvedValue({ ...processing, status }));
        await expect(promise).rejects.toMatchObject({
          suggestion: expect.stringContaining('gf status media-1 --type image'),
        });
        expect(vi.getTimerCount()).toBe(0);
      }
    );

    it('preserves the API failure reason', async () => {
      const getResult = vi.fn().mockResolvedValue({
        ...processing,
        error: 'Prompt rejected',
        status: IngredientStatus.FAILED,
      });
      await expect(start(getResult)).rejects.toThrow('Prompt rejected');
    });

    it.each([
      new AuthError(),
      new ApiError('bad request', 400),
      new ApiError('forbidden', 403),
      new ApiError('missing', 404),
    ])('fails promptly for permanent API denial %s', async (error) => {
      const getResult = vi.fn().mockRejectedValue(error);
      await expect(start(getResult)).rejects.toBe(error);
      await vi.advanceTimersByTimeAsync(20000);
      expect(getResult).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
      new Error('network unavailable'),
      new ApiError('slow', 408),
      new ApiError('rate limited', 429),
      new ApiError('unavailable', 503),
    ])('recovers from transient read error %s', async (error) => {
      const getResult = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(generated);
      const promise = start(getResult);
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(2000);
      expect((await promise).result).toEqual(generated);
      expect(getResult).toHaveBeenCalledTimes(2);
    });

    it('rejects an unexpected media identity', async () => {
      await expect(start(vi.fn().mockResolvedValue({ ...generated, id: 'other' }))).rejects.toThrow(
        'Unexpected media'
      );
    });

    it('times out and aborts a hanging initial read without later socket setup', async () => {
      let signal: AbortSignal | undefined;
      let finishRead: ((value: Observation) => void) | undefined;
      const getResult = vi.fn((value: AbortSignal) => {
        signal = value;
        return new Promise<Observation>((resolve) => {
          finishRead = resolve;
        });
      });
      const promise = start(getResult);
      const rejection = expect(promise).rejects.toThrow('Operation timed out');
      await vi.advanceTimersByTimeAsync(10000);
      await rejection;
      expect(signal?.aborted).toBe(true);
      finishRead?.(generated);
      await flushMicrotasks();
      expect(io).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(getResult).toHaveBeenCalledTimes(1);
    });

    it('keeps the overall deadline active during a hanging later GET', async () => {
      let readSignal: AbortSignal | undefined;
      const getResult = vi
        .fn()
        .mockResolvedValueOnce(processing)
        .mockImplementation((signal: AbortSignal) => {
          readSignal = signal;
          return new Promise<Observation>(() => {});
        });
      const promise = start(getResult);
      const rejection = expect(promise).rejects.toThrow('Operation timed out');
      await vi.advanceTimersByTimeAsync(10000);
      await rejection;
      expect(readSignal?.aborted).toBe(true);
      expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
      expect(handlers.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('does not open a late socket after configuration resolves past the deadline', async () => {
      let finishConfig: ((value: string) => void) | undefined;
      const store = await import('../../src/config/store');
      vi.mocked(store.getApiUrl).mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            finishConfig = resolve;
          })
      );
      const promise = start(vi.fn().mockResolvedValue(processing));
      const rejection = expect(promise).rejects.toThrow('Operation timed out');
      await vi.advanceTimersByTimeAsync(10000);
      await rejection;
      finishConfig?.('https://api.genfeed.ai/v1');
      await flushMicrotasks();
      expect(io).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('createWebSocketConnection', () => {
    it('opens a socket against the API origin with auth', async () => {
      const { io } = await import('socket.io-client');

      const socket = await createWebSocketConnection();

      expect(socket).toBe(mockSocket);
      expect(io).toHaveBeenCalledWith('https://api.genfeed.ai', {
        auth: { token: 'test-api-key' },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ['websocket'],
      });
    });

    it('does not create a socket when already aborted', async () => {
      const controller = new AbortController();
      controller.abort(new Error('Operation cancelled'));

      await expect(createWebSocketConnection(controller.signal)).rejects.toThrow(
        'Operation cancelled'
      );

      const { io } = await import('socket.io-client');
      expect(io).not.toHaveBeenCalled();
    });
  });
});
