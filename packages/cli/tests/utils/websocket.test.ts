import type { IBackgroundTaskUpdatePayload } from '@genfeedai/contracts/interfaces';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock socket.io-client
const mockSocket = {
  connected: true,
  disconnect: vi.fn(),
  on: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

async function flushMicrotasks(turns: number = 5): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
}

describe('utils/websocket', () => {
  let waitForCompletion: typeof import('../../src/utils/websocket').waitForCompletion;
  let createWebSocketConnection: typeof import('../../src/utils/websocket').createWebSocketConnection;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockSocket.on.mockReset();
    mockSocket.disconnect.mockReset();
    const store = await import('../../src/config/store');
    vi.spyOn(store, 'getApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(store, 'getApiUrl').mockResolvedValue('https://api.genfeed.ai/v1');

    const websocket = await import('../../src/utils/websocket');
    waitForCompletion = websocket.waitForCompletion;
    createWebSocketConnection = websocket.createWebSocketConnection;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('waitForCompletion', () => {
    it('resolves when receiving completed status', async () => {
      const mockResult = {
        id: 'test-123',
        status: 'completed',
        url: 'https://example.com/video.mp4',
      };
      const getResult = vi.fn().mockResolvedValue(mockResult);

      // Capture the event handlers
      const eventHandlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        eventHandlers[event] = handler;
        return mockSocket;
      });

      const promise = waitForCompletion({
        getResult,
        taskId: 'test-123',
        taskType: 'VIDEO',
        timeout: 5000,
      });
      await flushMicrotasks();
      expect(mockSocket.on).toHaveBeenCalled();

      // Simulate connection
      vi.advanceTimersByTime(0);
      eventHandlers.connect?.({});

      // Simulate completion event
      const updateEvent: IBackgroundTaskUpdatePayload = {
        progress: 100,
        resultId: 'test-123',
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'task-abc',
        timestamp: '2026-08-07T00:00:00.000Z',
        userId: 'user-1',
      };
      eventHandlers['background-task-update']?.(updateEvent);

      const result = await promise;
      expect(result.result).toEqual(mockResult);
      expect(getResult).toHaveBeenCalledTimes(1);
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('rejects when receiving failed status', async () => {
      const getResult = vi.fn();

      const eventHandlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        eventHandlers[event] = handler;
        return mockSocket;
      });

      const promise = waitForCompletion({
        getResult,
        taskId: 'test-456',
        taskType: 'IMAGE',
        timeout: 5000,
      });
      await flushMicrotasks();

      vi.advanceTimersByTime(0);
      eventHandlers.connect?.({});

      // Simulate failure event
      const updateEvent: IBackgroundTaskUpdatePayload = {
        error: 'Generation failed: invalid prompt',
        resultType: 'IMAGE',
        status: 'failed',
        taskId: 'test-456',
        timestamp: '2026-08-07T00:00:00.000Z',
        userId: 'user-1',
      };
      eventHandlers['background-task-update']?.(updateEvent);

      await expect(promise).rejects.toThrow('Generation failed: invalid prompt');
      expect(getResult).not.toHaveBeenCalled();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('ignores events for different task IDs', async () => {
      const mockResult = { id: 'test-123', status: 'completed' };
      const getResult = vi.fn().mockResolvedValue(mockResult);

      const eventHandlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        eventHandlers[event] = handler;
        return mockSocket;
      });

      const promise = waitForCompletion({
        getResult,
        taskId: 'test-123',
        taskType: 'VIDEO',
        timeout: 5000,
      });
      await flushMicrotasks();

      vi.advanceTimersByTime(0);
      eventHandlers.connect?.({});

      // Send event for different task - should be ignored
      const wrongTaskEvent: IBackgroundTaskUpdatePayload = {
        resultId: 'other-task',
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'other-task',
        timestamp: '2026-08-07T00:00:00.000Z',
        userId: 'user-1',
      };
      eventHandlers['background-task-update']?.(wrongTaskEvent);

      // getResult should not have been called
      expect(getResult).not.toHaveBeenCalled();

      // Now send correct event
      const correctEvent: IBackgroundTaskUpdatePayload = {
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'test-123',
        timestamp: '2026-08-07T00:00:00.000Z',
        userId: 'user-1',
      };
      eventHandlers['background-task-update']?.(correctEvent);

      const result = await promise;
      expect(result.result).toEqual(mockResult);
    });

    it('ignores events for different task types', async () => {
      const mockResult = { id: 'test-123', status: 'completed' };
      const getResult = vi.fn().mockResolvedValue(mockResult);

      const eventHandlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        eventHandlers[event] = handler;
        return mockSocket;
      });

      const promise = waitForCompletion({
        getResult,
        taskId: 'test-123',
        taskType: 'VIDEO',
        timeout: 5000,
      });
      await flushMicrotasks();

      vi.advanceTimersByTime(0);
      eventHandlers.connect?.({});

      // Send IMAGE event for same ID - should be ignored
      const wrongTypeEvent: IBackgroundTaskUpdatePayload = {
        resultType: 'IMAGE',
        status: 'completed',
        taskId: 'test-123',
        timestamp: '2026-08-07T00:00:00.000Z',
        userId: 'user-1',
      };
      eventHandlers['background-task-update']?.(wrongTypeEvent);

      expect(getResult).not.toHaveBeenCalled();

      // Now send correct type
      const correctEvent: IBackgroundTaskUpdatePayload = {
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'test-123',
        timestamp: '2026-08-07T00:00:00.000Z',
        userId: 'user-1',
      };
      eventHandlers['background-task-update']?.(correctEvent);

      const result = await promise;
      expect(result.result).toEqual(mockResult);
    });

    it('times out after specified duration', async () => {
      const getResult = vi.fn();

      const eventHandlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        eventHandlers[event] = handler;
        return mockSocket;
      });

      const promise = waitForCompletion({
        getResult,
        taskId: 'test-timeout',
        taskType: 'VIDEO',
        timeout: 5000,
      });
      await flushMicrotasks();

      vi.advanceTimersByTime(0);
      eventHandlers.connect?.({});

      // Advance past timeout
      vi.advanceTimersByTime(6000);

      await expect(promise).rejects.toThrow('Operation timed out');
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('rejects on connection error', async () => {
      const getResult = vi.fn();

      const eventHandlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        eventHandlers[event] = handler;
        return mockSocket;
      });

      const promise = waitForCompletion({
        getResult,
        taskId: 'test-conn-error',
        taskType: 'IMAGE',
        timeout: 5000,
      });
      await flushMicrotasks();

      vi.advanceTimersByTime(0);

      // Simulate connection error
      eventHandlers.connect_error?.({ message: 'Connection refused' });

      await expect(promise).rejects.toThrow('WebSocket connection failed: Connection refused');
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('updates spinner with progress', async () => {
      const mockResult = { id: 'test-progress', status: 'completed' };
      const getResult = vi.fn().mockResolvedValue(mockResult);
      const spinner = { text: '' };

      const eventHandlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        eventHandlers[event] = handler;
        return mockSocket;
      });

      const promise = waitForCompletion({
        getResult,
        spinner: spinner as Parameters<typeof waitForCompletion>[0]['spinner'],
        taskId: 'test-progress',
        taskType: 'VIDEO',
        timeout: 10000,
      });
      await flushMicrotasks();

      vi.advanceTimersByTime(0);
      eventHandlers.connect?.({});

      // Send progress update
      const progressEvent: IBackgroundTaskUpdatePayload = {
        progress: 50,
        resultType: 'VIDEO',
        status: 'processing',
        taskId: 'test-progress',
        timestamp: '2026-08-07T00:00:00.000Z',
        userId: 'user-1',
      };
      eventHandlers['background-task-update']?.(progressEvent);

      expect(spinner.text).toContain('50%');

      // Complete
      const completeEvent: IBackgroundTaskUpdatePayload = {
        progress: 100,
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'test-progress',
        timestamp: '2026-08-07T00:00:00.000Z',
        userId: 'user-1',
      };
      eventHandlers['background-task-update']?.(completeEvent);

      await promise;
    });

    it('rejects when getResult throws after completion', async () => {
      const getResult = vi.fn().mockRejectedValue(new Error('result fetch failed'));

      const eventHandlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        eventHandlers[event] = handler;
        return mockSocket;
      });

      const promise = waitForCompletion({
        getResult,
        taskId: 'test-bad-result',
        taskType: 'IMAGE',
        timeout: 5000,
      });
      await flushMicrotasks();

      vi.advanceTimersByTime(0);
      eventHandlers.connect?.({});

      const completeEvent: IBackgroundTaskUpdatePayload = {
        resultType: 'IMAGE',
        status: 'completed',
        taskId: 'test-bad-result',
        timestamp: '2026-08-07T00:00:00.000Z',
        userId: 'user-1',
      };
      eventHandlers['background-task-update']?.(completeEvent);

      await expect(promise).rejects.toThrow('result fetch failed');
      expect(getResult).toHaveBeenCalledTimes(1);
    });

    it('updates the spinner while an unresolved socket reconnects', async () => {
      const getResult = vi.fn().mockResolvedValue({ id: 'test-reconnect' });
      const spinner = { text: '' };

      const eventHandlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        eventHandlers[event] = handler;
        return mockSocket;
      });

      const promise = waitForCompletion({
        getResult,
        spinner: spinner as Parameters<typeof waitForCompletion>[0]['spinner'],
        taskId: 'test-reconnect',
        taskType: 'VIDEO',
        timeout: 5000,
      });
      await flushMicrotasks();

      vi.advanceTimersByTime(0);
      eventHandlers.connect?.({});
      eventHandlers.disconnect?.('transport close');

      expect(spinner.text).toBe('Reconnecting...');

      const completeEvent: IBackgroundTaskUpdatePayload = {
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'test-reconnect',
        timestamp: '2026-08-07T00:00:00.000Z',
        userId: 'user-1',
      };
      eventHandlers['background-task-update']?.(completeEvent);

      await promise;
    });

    it('ignores a client-initiated disconnect', async () => {
      const getResult = vi.fn().mockResolvedValue({ id: 'test-client-disconnect' });
      const spinner = { text: 'initial' };

      const eventHandlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        eventHandlers[event] = handler;
        return mockSocket;
      });

      const promise = waitForCompletion({
        getResult,
        spinner: spinner as Parameters<typeof waitForCompletion>[0]['spinner'],
        taskId: 'test-client-disconnect',
        taskType: 'VIDEO',
        timeout: 5000,
      });
      await flushMicrotasks();

      vi.advanceTimersByTime(0);
      eventHandlers.disconnect?.('io client disconnect');

      expect(spinner.text).toBe('initial');

      const completeEvent: IBackgroundTaskUpdatePayload = {
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'test-client-disconnect',
        timestamp: '2026-08-07T00:00:00.000Z',
        userId: 'user-1',
      };
      eventHandlers['background-task-update']?.(completeEvent);

      await promise;
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
