import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { WebSocketGateway } from '@libs/websockets/websockets.gateway';
import type { Server, Socket } from 'socket.io';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mocked,
  vi,
} from 'vitest';

const verifyMock = vi.hoisted(() => vi.fn());

vi.mock('@libs/auth/better-auth-jwks.verifier', () => ({
  BetterAuthJwksVerifier: class {
    verify = verifyMock;
  },
  resolveBetterAuthJwksUrl: (baseUrl: string) => `${baseUrl}/v1/auth/jwks`,
}));

describe('WebSocketGateway', () => {
  let gateway: WebSocketGateway;

  const mockRedisService: Mocked<
    Pick<RedisService, 'on' | 'subscribe' | 'unsubscribe' | 'publish'>
  > = {
    on: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };

  const mockLoggerService: Mocked<
    Pick<LoggerService, 'debug' | 'error' | 'log' | 'warn'>
  > = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn<(key: string) => string | undefined>(),
  };

  const mockServer: Pick<Server, 'emit' | 'to'> = {
    emit: vi.fn(),
    to: vi.fn().mockReturnThis(),
  };

  const createMockSocket = (
    overrides: Partial<Socket> = {},
  ): Partial<Socket> => ({
    disconnect: vi.fn(),
    emit: vi.fn(),
    handshake: {
      auth: {},
      headers: {},
      query: {
        organizationId: 'org-123',
        userId: 'user-123',
      },
    } as Socket['handshake'],
    id: 'socket-123',
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    gateway = new WebSocketGateway(
      mockConfigService,
      mockRedisService as unknown as RedisService,
      mockLoggerService as unknown as LoggerService,
    );

    gateway.server = mockServer as unknown as Server;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('should initialize and subscribe to Redis channels after startup delay', () => {
    gateway.afterInit(mockServer as unknown as Server);
    vi.advanceTimersByTime(100);

    expect(mockLoggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('WebSocket Gateway initialized'),
      expect.any(Object),
    );

    expect(mockRedisService.subscribe).toHaveBeenCalledTimes(13);
    expect(mockRedisService.on).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    );
  });

  it('should connect a client and join user/org rooms', async () => {
    const socket = createMockSocket();

    await gateway.handleConnection(socket as Socket);

    expect(socket.join).toHaveBeenCalledWith('user:user-123');
    expect(socket.join).toHaveBeenCalledWith('org-org-123');
    expect(socket.emit).toHaveBeenCalledWith(
      'connected',
      expect.objectContaining({
        organizationId: 'org-123',
        socketId: 'socket-123',
        userId: 'user-123',
      }),
    );
  });

  it('should disconnect client when userId cannot be resolved', async () => {
    const socket = createMockSocket({
      handshake: {
        auth: {},
        headers: {},
        query: {},
      } as Socket['handshake'],
    });

    await gateway.handleConnection(socket as Socket);

    expect(socket.disconnect).toHaveBeenCalledOnce();
  });

  it('resolves websocket identity from a verified Better Auth token', async () => {
    mockConfigService.get.mockReturnValue('http://localhost:3010');
    verifyMock.mockResolvedValue({
      sub: 'aaaaaaaa-0000-0000-0000-000000000001',
    });
    const socket = createMockSocket({
      handshake: {
        auth: { token: 'header.payload.signature' },
        headers: {},
        query: {
          organizationId: 'org-query',
          userId: 'user-query',
        },
      } as Socket['handshake'],
    });

    await gateway.handleConnection(socket as Socket);

    expect(verifyMock).toHaveBeenCalledWith('header.payload.signature');
    // `sub` (User.id) wins over the query userId.
    expect(socket.join).toHaveBeenCalledWith(
      'user:aaaaaaaa-0000-0000-0000-000000000001',
    );
    // Org is not embedded in the BA JWT, so it falls back to the query param.
    expect(socket.join).toHaveBeenCalledWith('org-org-query');
    expect(socket.emit).toHaveBeenCalledWith(
      'connected',
      expect.objectContaining({
        organizationId: 'org-query',
        userId: 'aaaaaaaa-0000-0000-0000-000000000001',
      }),
    );
  });

  it('falls back to query identity when Better Auth verification throws', async () => {
    mockConfigService.get.mockReturnValue('http://localhost:3010');
    verifyMock.mockRejectedValue(new Error('invalid signature'));
    const socket = createMockSocket({
      handshake: {
        auth: { token: 'bad.token.here' },
        headers: {},
        query: {
          organizationId: 'org-query',
          userId: 'user-query',
        },
      } as Socket['handshake'],
    });

    await gateway.handleConnection(socket as Socket);

    // A failed verify must not connect with a forged subject — it degrades to
    // the query identity (the unauthenticated fallback), never the bad token.
    expect(verifyMock).toHaveBeenCalledWith('bad.token.here');
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.join).toHaveBeenCalledWith('user:user-query');
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to verify Better Auth token'),
      expect.any(Object),
    );
  });

  it('should handle disconnect of unknown client without throwing', () => {
    const socket = createMockSocket({ id: 'missing-socket' });

    expect(() => gateway.handleDisconnect(socket as Socket)).not.toThrow();
  });
});
