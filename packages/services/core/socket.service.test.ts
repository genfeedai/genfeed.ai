import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock socket.io-client before any imports
const mockSocketOn = vi.fn();
const mockSocketConnect = vi.fn();
const mockSocketDisconnect = vi.fn();
const mockSocketEmit = vi.fn();
const mockSocketOff = vi.fn();
const mockSocketRemoveAllListeners = vi.fn();
const mockEngineClose = vi.fn();
const socketEventHandlers = new Map<string, (...args: unknown[]) => void>();
const socketState = vi.hoisted(() => ({ active: true, connected: false }));
const mockIo = vi.hoisted(() => vi.fn());
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('socket.io-client', () => ({
  io: mockIo.mockImplementation(
    (_endpoint: string, config: { auth?: unknown; extraHeaders?: unknown }) => {
      const socket = {
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
        io: {
          engine: { close: mockEngineClose },
          opts: { extraHeaders: config.extraHeaders },
        },
        off: mockSocketOff,
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          socketEventHandlers.set(event, handler);
          mockSocketOn(event, handler);
        }),
        removeAllListeners: mockSocketRemoveAllListeners,
      };

      return socket;
    },
  ),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    wsEndpoint: 'http://genfeed.localhost:3111',
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: mockLogger,
}));

import {
  isCrossIdentitySocketRotation,
  readSocketIdentityFromToken,
  SocketService,
} from '@services/core/socket.service';

function encodeJwtSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeJwt(claims: Record<string, unknown>): string {
  return `${encodeJwtSegment({ alg: 'none', typ: 'JWT' })}.${encodeJwtSegment(claims)}.sig`;
}

describe('SocketService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketEventHandlers.clear();
    socketState.active = true;
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

    it('returns the same instance when a different token is provided', () => {
      const i1 = SocketService.getInstance('token-a');
      const i2 = SocketService.getInstance('token-b');
      expect(i2).toBe(i1);
    });

    it('rotates the token in place without tearing down a live socket', () => {
      // Better Auth re-issues a JWT every ~30s; a rotated token must not
      // disconnect the socket (that is what made the UI flip to
      // "Reconnecting" and re-fetch threads on every rotation).
      socketState.connected = true;
      const service = SocketService.getInstance('token-a');
      const liveSocket = service.socket;

      SocketService.getInstance('token-b');

      expect(mockIo).toHaveBeenCalledTimes(1);
      expect(mockSocketDisconnect).not.toHaveBeenCalled();
      expect(mockSocketConnect).not.toHaveBeenCalled();
      expect(service.socket).toBe(liveSocket);
      expect(service.socket.auth).toEqual({ token: 'token-b' });
      expect(service.socket.io.opts.extraHeaders).toEqual({
        Authorization: 'Bearer token-b',
      });
    });

    it('reconnects with the rotated token when the socket is idle', () => {
      socketState.connected = false;
      socketState.active = false;
      SocketService.getInstance('token-a');

      SocketService.getInstance('token-b');

      expect(mockIo).toHaveBeenCalledTimes(1);
      expect(mockSocketDisconnect).not.toHaveBeenCalled();
      expect(mockSocketConnect).toHaveBeenCalledOnce();
    });

    it('keeps same-user Better Auth refresh in place without rebinding rooms', () => {
      socketState.connected = true;
      const previous = makeJwt({
        organizationId: 'org-a',
        sub: 'user-a',
      });
      const next = makeJwt({
        organizationId: 'org-a',
        sub: 'user-a',
      });
      SocketService.getInstance(previous);

      SocketService.getInstance(next);

      expect(mockSocketEmit).not.toHaveBeenCalled();
      expect(mockSocketDisconnect).not.toHaveBeenCalled();
      expect(mockSocketConnect).not.toHaveBeenCalled();
    });

    it('disconnects before reconnecting so prior rooms cannot deliver during identity swap', () => {
      socketState.connected = true;
      const previous = makeJwt({
        organizationId: 'org-a',
        sub: 'user-a',
      });
      const next = makeJwt({
        organizationId: 'org-b',
        sub: 'user-b',
      });
      const order: string[] = [];
      const lateOldRoomDeliveries: string[] = [];

      mockSocketDisconnect.mockImplementation(() => {
        socketState.connected = false;
        socketState.active = false;
        order.push('disconnect');
        // A Redis fan-out for the prior user room in this window must not
        // find a connected socket.
        if (socketState.connected) {
          lateOldRoomDeliveries.push('user:user-a');
        }
      });
      mockSocketConnect.mockImplementation(() => {
        expect(socketState.connected).toBe(false);
        order.push('connect');
        socketState.connected = true;
        socketState.active = true;
      });

      const service = SocketService.getInstance(previous);
      SocketService.getInstance(next);

      expect(order).toEqual(['disconnect', 'connect']);
      expect(lateOldRoomDeliveries).toEqual([]);
      expect(mockSocketEmit).not.toHaveBeenCalled();
      expect(mockIo).toHaveBeenCalledTimes(1);
      expect(service.socket.auth).toEqual({ token: next });
      expect(mockSocketDisconnect.mock.invocationCallOrder[0]).toBeLessThan(
        mockSocketConnect.mock.invocationCallOrder[0],
      );
    });

    it('restarts an in-flight handshake when identity changes again during reconnect', () => {
      socketState.connected = true;
      socketState.active = true;
      const tokenA = makeJwt({
        organizationId: 'org-a',
        sub: 'user-a',
      });
      const tokenB = makeJwt({
        organizationId: 'org-b',
        sub: 'user-b',
      });
      const tokenC = makeJwt({
        organizationId: 'org-c',
        sub: 'user-c',
      });
      const order: string[] = [];

      mockSocketDisconnect.mockImplementation(() => {
        order.push('disconnect');
        socketState.connected = false;
        socketState.active = false;
      });
      mockEngineClose.mockImplementation(() => {
        order.push('engine-close');
        socketState.connected = false;
        socketState.active = false;
      });
      mockSocketConnect.mockImplementation(() => {
        order.push('connect');
        socketState.connected = false;
        socketState.active = true;
      });

      const service = SocketService.getInstance(tokenA);
      SocketService.getInstance(tokenB);
      SocketService.getInstance(tokenC);

      expect(order).toEqual([
        'disconnect',
        'connect',
        'disconnect',
        'engine-close',
        'connect',
      ]);
      expect(service.socket.auth).toEqual({ token: tokenC });
      expect(mockIo).toHaveBeenCalledTimes(1);
    });

    it('keeps same-user refresh in place while a reconnect is in flight', () => {
      socketState.connected = false;
      socketState.active = true;
      const previous = makeJwt({
        organizationId: 'org-a',
        sub: 'user-a',
      });
      const next = makeJwt({
        organizationId: 'org-a',
        sub: 'user-a',
      });
      SocketService.getInstance(previous);

      SocketService.getInstance(next);

      expect(mockSocketDisconnect).not.toHaveBeenCalled();
      expect(mockSocketConnect).not.toHaveBeenCalled();
      expect(mockEngineClose).not.toHaveBeenCalled();
    });
  });

  describe('socket identity claims', () => {
    it('reads user and org claims from a JWT payload', () => {
      expect(
        readSocketIdentityFromToken(
          makeJwt({ organizationId: 'org-1', sub: 'user-1' }),
        ),
      ).toEqual({ organizationId: 'org-1', userId: 'user-1' });
    });

    it('does not treat opaque refresh tokens as a cross-identity swap', () => {
      expect(isCrossIdentitySocketRotation('token-a', 'token-b')).toBe(false);
    });

    it('treats an unreadable next token after a known JWT as a cross-identity swap', () => {
      expect(
        isCrossIdentitySocketRotation(
          makeJwt({ organizationId: 'org-a', sub: 'user-a' }),
          'opaque-refresh',
        ),
      ).toBe(true);
    });

    it('detects a user or org change as a cross-identity rotation', () => {
      expect(
        isCrossIdentitySocketRotation(
          makeJwt({ organizationId: 'org-a', sub: 'user-a' }),
          makeJwt({ organizationId: 'org-a', sub: 'user-b' }),
        ),
      ).toBe(true);
      expect(
        isCrossIdentitySocketRotation(
          makeJwt({ organizationId: 'org-a', sub: 'user-a' }),
          makeJwt({ organizationId: 'org-b', sub: 'user-a' }),
        ),
      ).toBe(true);
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
    it('keeps deliberate client disconnects out of warning telemetry', () => {
      SocketService.getInstance();

      const disconnectHandler = socketEventHandlers.get('disconnect');
      expect(disconnectHandler).toBeDefined();

      socketState.active = false;
      disconnectHandler?.('io client disconnect');

      expect(mockLogger.info).toHaveBeenCalledWith('Socket disconnected', {
        expected: true,
        reason: 'io client disconnect',
        recovery: 'none',
      });
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it.each(['ping timeout', 'transport close', 'transport error'])(
      'records %s as an automatically recovering interruption',
      (reason) => {
        SocketService.getInstance();

        socketState.active = true;
        socketEventHandlers.get('disconnect')?.(reason);

        expect(mockLogger.info).toHaveBeenCalledWith(
          'Socket connection interrupted',
          {
            expected: false,
            reason,
            recovery: 'automatic',
          },
        );
        expect(mockLogger.warn).not.toHaveBeenCalled();
      },
    );

    it('keeps server-forced disconnects observable with bounded context', () => {
      SocketService.getInstance();

      socketState.active = false;
      socketEventHandlers.get('disconnect')?.('io server disconnect');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Socket disconnected unexpectedly',
        {
          expected: false,
          reason: 'io server disconnect',
          recovery: 'manual',
          tags: {
            component: 'realtime',
            recovery: 'manual',
          },
        },
      );
    });

    it('does not report temporary connection errors while Socket.IO retries', () => {
      SocketService.getInstance();

      socketState.active = true;
      socketEventHandlers.get('connect_error')?.(
        new Error('token and endpoint content must stay out of telemetry'),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Socket connection retry scheduled',
        {
          errorName: 'Error',
          recovery: 'automatic',
        },
      );
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('reports rejected connections without error-message content', () => {
      SocketService.getInstance();

      socketState.active = false;
      socketEventHandlers.get('connect_error')?.(
        new TypeError('sensitive endpoint response'),
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Socket connection rejected',
        {
          errorName: 'TypeError',
          recovery: 'manual',
          tags: {
            component: 'realtime',
            recovery: 'manual',
          },
        },
      );
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ message: expect.anything() }),
      );
    });
  });
});
