import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock socket.io-client
const mockSocketOn = vi.fn();
const mockSocketOff = vi.fn();
const mockSocketConnect = vi.fn();
const mockSocketDisconnect = vi.fn();
const mockSocketEmit = vi.fn();
const mockSocketRemoveAllListeners = vi.fn();
const mockManagerOn = vi.fn();
const mockManagerOff = vi.fn();
const socketState = vi.hoisted(() => ({ active: true, connected: false }));

vi.mock('socket.io-client', () => ({
  io: vi.fn((_endpoint: string, config: { auth?: unknown }) => ({
    get active() {
      return socketState.active;
    },
    auth: config.auth,
    connect: mockSocketConnect,
    get connected() {
      return socketState.connected;
    },
    disconnect: mockSocketDisconnect,
    emit: mockSocketEmit,
    id: 'mock-socket-id',
    io: {
      engine: { close: vi.fn() },
      off: mockManagerOff,
      on: mockManagerOn,
      opts: {},
    },
    off: mockSocketOff,
    on: mockSocketOn,
    removeAllListeners: mockSocketRemoveAllListeners,
  })),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    wsEndpoint: 'http://genfeed.localhost:3111',
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({ error: vi.fn(), success: vi.fn() })),
  },
}));

import { logger } from '@services/core/logger.service';
import { SocketService } from '@services/core/socket.service';
import {
  createMediaHandler,
  SocketManager,
} from '@services/core/socket-manager.service';

describe('SocketManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketState.active = true;
    socketState.connected = false;
    SocketManager.clearInstance();
    SocketService.clearInstance();
  });

  afterEach(() => {
    vi.useRealTimers();
    SocketManager.clearInstance();
    SocketService.clearInstance();
  });

  describe('getInstance', () => {
    it('returns a SocketManager instance', () => {
      const instance = SocketManager.getInstance();
      expect(instance).toBeInstanceOf(SocketManager);
    });

    it('returns the same instance on repeated calls (singleton)', () => {
      const i1 = SocketManager.getInstance();
      const i2 = SocketManager.getInstance();
      expect(i1).toBe(i2);
    });

    it('creates a new instance after clearInstance', () => {
      const i1 = SocketManager.getInstance({ token: 'token-a' });
      SocketManager.clearInstance();
      const i2 = SocketManager.getInstance({ token: 'token-b' });
      expect(i1).not.toBe(i2);
    });

    it('keeps the same instance and its listeners when the token rotates', () => {
      // ~26 useSocketManager consumers call getInstance on every effect run
      // with a freshly resolved (rotated) JWT. Recreating the manager here
      // dropped every subscription and re-ran the reconnect side effects.
      const i1 = SocketManager.getInstance({ token: 'token-a' });
      const handler = vi.fn();
      i1.subscribe('agent:token', handler);
      const stateListener = vi.fn();
      i1.subscribeConnectionState(stateListener);
      stateListener.mockClear();
      mockSocketOff.mockClear();

      const i2 = SocketManager.getInstance({ token: 'token-b' });

      expect(i2).toBe(i1);
      expect(i2.getListenersCount()).toBe(1);
      expect(mockSocketOff).not.toHaveBeenCalled();
      expect(mockSocketDisconnect).not.toHaveBeenCalled();
      expect(stateListener).not.toHaveBeenCalled();
      expect(i2.getSocketService().socket.auth).toEqual({ token: 'token-b' });
    });

    it('refreshes an opaque socket token before the fallback window ends', async () => {
      vi.useFakeTimers();
      const resolveToken = vi.fn().mockResolvedValue('token-b');

      const manager = SocketManager.getInstance({
        resolveToken,
        token: 'token-a',
      });

      await vi.advanceTimersByTimeAsync(10 * 60 * 1_000);

      expect(resolveToken).toHaveBeenCalledOnce();
      expect(manager.getSocketService().socket.auth).toEqual({
        token: 'token-b',
      });
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('subscribe calls socket.on with the event name and a handler function', () => {
      const manager = SocketManager.getInstance();
      const handler = vi.fn();
      manager.subscribe('test-event', handler);
      // The SocketManager wraps the handler before passing to socket.on
      expect(mockSocketOn).toHaveBeenCalledWith(
        'test-event',
        expect.any(Function),
      );
    });

    it('subscribe returns an unsubscribe function', () => {
      const manager = SocketManager.getInstance();
      const handler = vi.fn();
      const unsubscribe = manager.subscribe('ev', handler);
      expect(typeof unsubscribe).toBe('function');
    });

    it('subscribe increments the listener count', () => {
      const manager = SocketManager.getInstance({ autoConnect: false });
      const before = manager.getListenersCount();
      manager.subscribe('ev', vi.fn());
      expect(manager.getListenersCount()).toBe(before + 1);
    });

    it('unsubscribe removes the listener and calls socket.off', () => {
      const manager = SocketManager.getInstance();
      const handler = vi.fn();
      manager.subscribe('ev', handler);
      const countAfterSub = manager.getListenersCount();
      manager.unsubscribe('ev', handler);
      // socket.off should have been called with the wrapped handler
      expect(mockSocketOff).toHaveBeenCalledWith('ev', expect.any(Function));
      expect(manager.getListenersCount()).toBe(countAfterSub - 1);
    });
  });

  describe('getListenersCount', () => {
    it('returns 0 initially', () => {
      const manager = SocketManager.getInstance({ autoConnect: false });
      expect(manager.getListenersCount()).toBe(0);
    });

    it('increments when listeners are added', () => {
      const manager = SocketManager.getInstance({ autoConnect: false });
      manager.subscribe('ev1', vi.fn());
      manager.subscribe('ev2', vi.fn());
      expect(manager.getListenersCount()).toBe(2);
    });
  });

  describe('connection recovery', () => {
    const getSocketHandler = (event: string) => {
      const call = mockSocketOn.mock.calls.findLast(
        ([registeredEvent]) => registeredEvent === event,
      );
      return call?.[1] as ((...args: unknown[]) => void) | undefined;
    };

    it('observes reconnect attempts on the underlying Socket.IO manager', () => {
      const manager = SocketManager.getInstance({ autoConnect: false });
      const states: string[] = [];
      manager.subscribeConnectionState((state) => states.push(state));

      expect(mockManagerOn).toHaveBeenCalledWith(
        'reconnect_attempt',
        expect.any(Function),
      );
      expect(mockSocketOn).not.toHaveBeenCalledWith(
        'reconnect_attempt',
        expect.any(Function),
      );

      const reconnectAttemptHandler = mockManagerOn.mock.calls.find(
        ([event]) => event === 'reconnect_attempt',
      )?.[1] as (() => void) | undefined;
      reconnectAttemptHandler?.();

      expect(states.at(-1)).toBe('reconnecting');
    });

    it('keeps subscriptions active while transport loss reconnects automatically', () => {
      const manager = SocketManager.getInstance({ autoConnect: false });
      const eventHandler = vi.fn();
      const states: string[] = [];
      manager.subscribe('generation-progress', eventHandler);
      manager.subscribeConnectionState((state) => states.push(state));

      socketState.active = true;
      getSocketHandler('disconnect')?.('transport close');

      expect(states.at(-1)).toBe('reconnecting');
      expect(mockSocketConnect).not.toHaveBeenCalled();

      socketState.connected = true;
      getSocketHandler('connect')?.();
      const subscribedHandler = mockSocketOn.mock.calls.find(
        ([event]) => event === 'generation-progress',
      )?.[1] as ((data: unknown) => void) | undefined;
      subscribedHandler?.({ progress: 25 });

      expect(states.at(-1)).toBe('connected');
      expect(eventHandler).toHaveBeenCalledWith({ progress: 25 });
      expect(mockSocketOff).not.toHaveBeenCalledWith(
        'generation-progress',
        expect.any(Function),
      );
    });

    it('backs off before reconnecting a server-disconnected namespace', () => {
      vi.useFakeTimers();
      const manager = SocketManager.getInstance({ autoConnect: false });
      const states: string[] = [];
      manager.subscribeConnectionState((state) => states.push(state));

      socketState.active = false;
      getSocketHandler('disconnect')?.('io server disconnect');

      expect(states.at(-1)).toBe('reconnecting');
      expect(mockSocketConnect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(999);
      expect(mockSocketConnect).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockSocketConnect).toHaveBeenCalledOnce();
      vi.useRealTimers();
    });

    it('leaves deliberate client disconnects offline without reconnecting', () => {
      const manager = SocketManager.getInstance({ autoConnect: false });
      const states: string[] = [];
      manager.subscribeConnectionState((state) => states.push(state));

      socketState.active = false;
      getSocketHandler('disconnect')?.('io client disconnect');

      expect(states.at(-1)).toBe('offline');
      expect(mockSocketConnect).not.toHaveBeenCalled();
    });

    it('exposes denied connection attempts as offline', () => {
      const manager = SocketManager.getInstance({ autoConnect: false });
      const states: string[] = [];
      manager.subscribeConnectionState((state) => states.push(state));

      socketState.active = false;
      getSocketHandler('connect_error')?.(new Error('denied'));

      expect(states.at(-1)).toBe('offline');
    });

    it('removes manager reconnect listeners during cleanup', () => {
      SocketManager.getInstance({ autoConnect: false });

      SocketManager.clearInstance();

      expect(mockManagerOff).toHaveBeenCalledWith(
        'reconnect_attempt',
        expect.any(Function),
      );
    });
  });

  describe('getSocketService', () => {
    it('returns the underlying SocketService', () => {
      const manager = SocketManager.getInstance();
      expect(manager.getSocketService()).toBeInstanceOf(SocketService);
    });
  });

  describe('clearInstance', () => {
    it('resets the singleton so next call creates a fresh instance', () => {
      const i1 = SocketManager.getInstance({ token: 'x' });
      SocketManager.clearInstance();
      const i2 = SocketManager.getInstance({ token: 'x' });
      expect(i1).not.toBe(i2);
    });
  });
});

describe('createMediaHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports provider failures without raising a handled console error', () => {
    const onFailed = vi.fn();
    const handler = createMediaHandler(vi.fn(), onFailed);

    handler({
      error: 'Director: unexpected error handling prediction (E9828)',
      status: 'failed',
    });

    expect(onFailed).toHaveBeenCalledWith(
      'Director: unexpected error handling prediction (E9828)',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Media handler received failure',
      expect.objectContaining({
        error: 'Director: unexpected error handling prediction (E9828)',
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('normalizes structured provider errors before handing them to the UI', () => {
    const onFailed = vi.fn();
    const handler = createMediaHandler(vi.fn(), onFailed);

    handler({ error: { message: 'GPU timeout' }, status: 'failed' });

    expect(onFailed).toHaveBeenCalledWith('GPU timeout');
    expect(logger.warn).toHaveBeenCalledWith(
      'Media handler received failure',
      expect.objectContaining({ error: 'GPU timeout' }),
    );
  });
});
