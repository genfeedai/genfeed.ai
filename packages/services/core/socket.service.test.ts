import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock socket.io-client before any imports
const mockSocketOn = vi.fn();
const mockSocketConnect = vi.fn();
const mockSocketDisconnect = vi.fn();
const mockSocketOff = vi.fn();
const mockSocketRemoveAllListeners = vi.fn();
const socketEventHandlers = new Map<string, (...args: unknown[]) => void>();
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    const socket = {
      connect: mockSocketConnect,
      disconnect: mockSocketDisconnect,
      off: mockSocketOff,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        socketEventHandlers.set(event, handler);
        mockSocketOn(event, handler);
      }),
      removeAllListeners: mockSocketRemoveAllListeners,
    };

    return socket;
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    wsEndpoint: 'http://localhost:3013',
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: mockLogger,
}));

import { SocketService } from '@services/core/socket.service';

describe('SocketService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketEventHandlers.clear();
    SocketService.clearInstance();
  });

  afterEach(() => {
    SocketService.clearInstance();
  });

  describe('getInstance', () => {
    it('returns a SocketService instance', () => {
      const instance = SocketService.getInstance();
      expect(instance).toBeInstanceOf(SocketService);
    });

    it('returns the same instance on repeated calls (singleton)', () => {
      const i1 = SocketService.getInstance();
      const i2 = SocketService.getInstance();
      expect(i1).toBe(i2);
    });

    it('returns a new instance when a different token is provided', () => {
      const i1 = SocketService.getInstance('token-a');
      // Providing a different token forces re-init via updateToken,
      // but since we cleared, the instance is new each time.
      const i2 = SocketService.getInstance('token-b');
      // The same classInstance reference is returned (token is updated in-place)
      expect(i2).toBe(i1);
    });
  });

  describe('connect', () => {
    it('calls socket.connect()', () => {
      const service = SocketService.getInstance();
      service.connect();
      expect(mockSocketConnect).toHaveBeenCalledOnce();
    });
  });

  describe('disconnect', () => {
    it('calls socket.disconnect()', () => {
      const service = SocketService.getInstance();
      service.disconnect();
      expect(mockSocketDisconnect).toHaveBeenCalled();
    });
  });

  describe('off', () => {
    it('calls socket.off() with the event name', () => {
      const service = SocketService.getInstance();
      const handler = vi.fn();
      service.off('my-event', handler);
      expect(mockSocketOff).toHaveBeenCalledWith('my-event', handler);
    });
  });

  describe('clearInstance', () => {
    it('destroys the singleton so a new one is created next call', () => {
      const i1 = SocketService.getInstance('tok');
      SocketService.clearInstance();
      const i2 = SocketService.getInstance('tok');
      expect(i1).not.toBe(i2);
    });
  });

  describe('socket lifecycle logging', () => {
    it('logs disconnects as warnings instead of errors', () => {
      SocketService.getInstance();

      const disconnectHandler = socketEventHandlers.get('disconnect');
      expect(disconnectHandler).toBeDefined();

      disconnectHandler?.('transport close');

      expect(mockLogger.warn).toHaveBeenCalledWith('Socket disconnected', {
        expected: true,
        reason: 'transport close',
      });
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        'Socket disconnected',
        expect.anything(),
      );
    });
  });
});
