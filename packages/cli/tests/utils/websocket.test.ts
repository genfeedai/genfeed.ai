import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundTaskUpdate } from '../../src/utils/websocket.js';

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
  let waitForCompletion: typeof import('../../src/utils/websocket.js').waitForCompletion;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockSocket.on.mockReset();
    mockSocket.disconnect.mockReset();
    const store = await import('../../src/config/store.js');
    vi.spyOn(store, 'getApiKey').mockResolvedValue('test-api-key');
    vi.spyOn(store, 'getApiUrl').mockResolvedValue('https://api.genfeed.ai/v1');

    const websocket = await import('../../src/utils/websocket.js');
    waitForCompletion = websocket.waitForCompletion;
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
      const updateEvent: BackgroundTaskUpdate = {
        progress: 100,
        resultId: 'test-123',
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'task-abc',
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
      const updateEvent: BackgroundTaskUpdate = {
        error: 'Generation failed: invalid prompt',
        resultType: 'IMAGE',
        status: 'failed',
        taskId: 'test-456',
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
      const wrongTaskEvent: BackgroundTaskUpdate = {
        resultId: 'other-task',
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'other-task',
      };
      eventHandlers['background-task-update']?.(wrongTaskEvent);

      // getResult should not have been called
      expect(getResult).not.toHaveBeenCalled();

      // Now send correct event
      const correctEvent: BackgroundTaskUpdate = {
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'test-123',
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
      const wrongTypeEvent: BackgroundTaskUpdate = {
        resultType: 'IMAGE',
        status: 'completed',
        taskId: 'test-123',
      };
      eventHandlers['background-task-update']?.(wrongTypeEvent);

      expect(getResult).not.toHaveBeenCalled();

      // Now send correct type
      const correctEvent: BackgroundTaskUpdate = {
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'test-123',
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
      const progressEvent: BackgroundTaskUpdate = {
        progress: 50,
        resultType: 'VIDEO',
        status: 'processing',
        taskId: 'test-progress',
      };
      eventHandlers['background-task-update']?.(progressEvent);

      expect(spinner.text).toContain('50%');

      // Complete
      const completeEvent: BackgroundTaskUpdate = {
        progress: 100,
        resultType: 'VIDEO',
        status: 'completed',
        taskId: 'test-progress',
      };
      eventHandlers['background-task-update']?.(completeEvent);

      await promise;
    });

    it('handles ingredient-status events', async () => {
      const mockResult = { id: 'test-ingredient', status: 'completed' };
      const getResult = vi.fn().mockResolvedValue(mockResult);

      const eventHandlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        eventHandlers[event] = handler;
        return mockSocket;
      });

      const promise = waitForCompletion({
        getResult,
        taskId: 'test-ingredient',
        taskType: 'IMAGE',
        timeout: 5000,
      });
      await flushMicrotasks();

      vi.advanceTimersByTime(0);
      eventHandlers.connect?.({});

      // Simulate ingredient-status event
      eventHandlers['/ingredients/test-ingredient/status']?.({ status: 'generated' });

      const result = await promise;
      expect(result.result).toEqual(mockResult);
    });
  });
});
