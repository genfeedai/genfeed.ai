import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock socket.io-client
const mockSocketOn = vi.fn();
const mockSocketOff = vi.fn();
const mockSocketConnect = vi.fn();
const mockSocketDisconnect = vi.fn();
const mockSocketRemoveAllListeners = vi.fn();

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    connect: mockSocketConnect,
    disconnect: mockSocketDisconnect,
    id: 'mock-socket-id',
    off: mockSocketOff,
    on: mockSocketOn,
    removeAllListeners: mockSocketRemoveAllListeners,
  })),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    wsEndpoint: 'http://localhost:3013',
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
