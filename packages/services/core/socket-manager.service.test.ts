import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock socket.io-client
const mockSocketOn = vi.fn();
const mockSocketOff = vi.fn();
const mockSocketConnect = vi.fn();
const mockSocketDisconnect = vi.fn();
const mockSocketRemoveAllListeners = vi.fn();
const mockManagerOn = vi.fn();
const mockManagerOff = vi.fn();
const socketState = vi.hoisted(() => ({ active: true, connected: false }));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    get active() {
      return socketState.active;
    },
    connect: mockSocketConnect,
    get connected() {
      return socketState.connected;
    },
    disconnect: mockSocketDisconnect,
    id: 'mock-socket-id',
    io: {
      off: mockManagerOff,
      on: mockManagerOn,
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

import { SocketService } from '@services/core/socket.service';
import { SocketManager } from '@services/core/socket-manager.service';

describe('SocketManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketState.active = true;
    socketState.connected = false;
    SocketManager.clearInstance();
    SocketService.clearInstance();
  });

  afterEach(() => {
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

    it('creates a new instance when the token changes', () => {
      const i1 = SocketManager.getInstance({ token: 'token-a' });
      SocketManager.clearInstance();
      const i2 = SocketManager.getInstance({ token: 'token-b' });
      expect(i1).not.toBe(i2);
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

    it('manually reconnects a server-disconnected namespace', () => {
      const manager = SocketManager.getInstance({ autoConnect: false });
      const states: string[] = [];
      manager.subscribeConnectionState((state) => states.push(state));

      socketState.active = false;
      getSocketHandler('disconnect')?.('io server disconnect');

      expect(states.at(-1)).toBe('reconnecting');
      expect(mockSocketConnect).toHaveBeenCalledOnce();
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
