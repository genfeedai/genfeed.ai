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
  createBetterAuthJwksVerifierOptions: (baseUrl: string) => ({
    audience: baseUrl,
    issuer: baseUrl,
    jwksUrl: `${baseUrl}/v1/auth/jwks`,
  }),
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
    leave: vi.fn().mockResolvedValue(undefined),
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

  it('disconnects query-identity clients without a verified token', async () => {
    const socket = createMockSocket();

    await gateway.handleConnection(socket as Socket);

    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalledWith(
      'connected',
      expect.any(Object),
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
      organizationId: 'org-signed',
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
    // Signed org wins over the forged query org.
    expect(socket.join).toHaveBeenCalledWith('org-org-signed');
    expect(socket.join).not.toHaveBeenCalledWith('org-org-query');
    expect(socket.emit).toHaveBeenCalledWith(
      'connected',
      expect.objectContaining({
        organizationId: 'org-signed',
        userId: 'aaaaaaaa-0000-0000-0000-000000000001',
      }),
    );
  });

  it('does not join an org room when a verified token has no org claim', async () => {
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

    expect(socket.join).toHaveBeenCalledWith(
      'user:aaaaaaaa-0000-0000-0000-000000000001',
    );
    expect(socket.join).not.toHaveBeenCalledWith('org-org-query');
    expect(socket.emit).toHaveBeenCalledWith(
      'connected',
      expect.objectContaining({
        organizationId: undefined,
        userId: 'aaaaaaaa-0000-0000-0000-000000000001',
      }),
    );
  });

  it('disconnects when Better Auth verification throws', async () => {
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

    expect(verifyMock).toHaveBeenCalledWith('bad.token.here');
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(socket.join).not.toHaveBeenCalledWith('user:user-query');
    expect(socket.join).not.toHaveBeenCalledWith('org-org-query');
    expect(socket.emit).not.toHaveBeenCalledWith(
      'connected',
      expect.any(Object),
    );
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to verify Better Auth token'),
      expect.any(Object),
    );
  });

  it('should handle disconnect of unknown client without throwing', () => {
    const socket = createMockSocket({ id: 'missing-socket' });

    expect(() => gateway.handleDisconnect(socket as Socket)).not.toThrow();
  });

  it('leaves prior rooms before verification so the old identity cannot receive events', async () => {
    mockConfigService.get.mockReturnValue('http://localhost:3010');
    verifyMock.mockResolvedValueOnce({
      organizationId: 'org-a',
      sub: 'user-a',
    });
    const socket = createMockSocket({
      handshake: {
        auth: { token: 'token-a' },
        headers: {},
        query: {},
      } as Socket['handshake'],
    });

    await gateway.handleConnection(socket as Socket);

    let releaseVerify: (value: {
      organizationId: string;
      sub: string;
    }) => void = () => undefined;
    const verifyStarted = new Promise<void>((resolveStarted) => {
      verifyMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStarted();
            releaseVerify = resolve;
          }),
      );
    });

    const rotatePromise = gateway.handleIdentityRotate(
      { token: 'token-b' },
      socket as Socket,
    );

    await verifyStarted;

    expect(socket.leave).toHaveBeenCalledWith('user:user-a');
    expect(socket.leave).toHaveBeenCalledWith('org-org-a');
    expect(socket.join).not.toHaveBeenCalledWith('user:user-b');
    await expect(
      gateway.handleIngredientUpdate(
        { ingredientId: 'ing-1' },
        socket as Socket,
      ),
    ).resolves.toEqual({ error: 'Unauthorized' });

    releaseVerify({ organizationId: 'org-b', sub: 'user-b' });

    await expect(rotatePromise).resolves.toEqual({
      organizationId: 'org-b',
      success: true,
      userId: 'user-b',
    });
    expect(socket.join).toHaveBeenCalledWith('user:user-b');
    expect(socket.join).toHaveBeenCalledWith('org-org-b');
  });

  it('leaves prior user and org rooms before accepting a rotated identity', async () => {
    mockConfigService.get.mockReturnValue('http://localhost:3010');
    verifyMock.mockResolvedValueOnce({
      organizationId: 'org-a',
      sub: 'user-a',
    });
    const socket = createMockSocket({
      handshake: {
        auth: { token: 'token-a' },
        headers: {},
        query: {},
      } as Socket['handshake'],
    });

    await gateway.handleConnection(socket as Socket);

    verifyMock.mockResolvedValueOnce({
      organizationId: 'org-b',
      sub: 'user-b',
    });

    await expect(
      gateway.handleIdentityRotate({ token: 'token-b' }, socket as Socket),
    ).resolves.toEqual({
      organizationId: 'org-b',
      success: true,
      userId: 'user-b',
    });

    expect(socket.leave).toHaveBeenCalledWith('user:user-a');
    expect(socket.leave).toHaveBeenCalledWith('org-org-a');
    expect(socket.join).toHaveBeenCalledWith('user:user-b');
    expect(socket.join).toHaveBeenCalledWith('org-org-b');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('revokes the prior identity when rotation verification fails', async () => {
    mockConfigService.get.mockReturnValue('http://localhost:3010');
    verifyMock.mockResolvedValueOnce({
      organizationId: 'org-a',
      sub: 'user-a',
    });
    const socket = createMockSocket({
      handshake: {
        auth: { token: 'token-a' },
        headers: {},
        query: {},
      } as Socket['handshake'],
    });

    await gateway.handleConnection(socket as Socket);

    verifyMock.mockRejectedValueOnce(new Error('invalid signature'));

    await expect(
      gateway.handleIdentityRotate({ token: 'token-bad' }, socket as Socket),
    ).resolves.toEqual({ error: 'Unauthorized' });

    expect(socket.leave).toHaveBeenCalledWith('user:user-a');
    expect(socket.leave).toHaveBeenCalledWith('org-org-a');
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(gateway.getConnectionStatus()).toEqual({
      totalClients: 0,
      totalUsers: 0,
      users: [],
    });
  });
});

describe('WebSocketGateway redis message dispatch', () => {
  const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
  const USER_ROOM = `user:${USER_ID}`;

  let gateway: WebSocketGateway;
  let roomEmit: ReturnType<typeof vi.fn>;
  let serverTo: ReturnType<typeof vi.fn>;
  let serverEmit: ReturnType<typeof vi.fn>;
  let dispatch: (channel: string, message: string) => void;

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

  const createVerifiedSocket = (id: string): Partial<Socket> => ({
    disconnect: vi.fn(),
    emit: vi.fn(),
    handshake: {
      auth: { token: 'header.payload.signature' },
      headers: {},
      query: {},
    } as Socket['handshake'],
    id,
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    roomEmit = vi.fn();
    serverTo = vi.fn(() => ({ emit: roomEmit }));
    serverEmit = vi.fn();
    const server = {
      emit: serverEmit,
      sockets: {
        adapter: {
          rooms: new Map<string, Set<string>>([
            [USER_ROOM, new Set(['socket-1'])],
          ]),
        },
      },
      to: serverTo,
    } as unknown as Server;

    gateway = new WebSocketGateway(
      mockConfigService,
      mockRedisService as unknown as RedisService,
      mockLoggerService as unknown as LoggerService,
    );
    gateway.afterInit(server);
    vi.advanceTimersByTime(100);

    const messageCall = mockRedisService.on.mock.calls.find(
      ([event]) => event === 'message',
    );
    dispatch = messageCall?.[1] as unknown as (
      channel: string,
      message: string,
    ) => void;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('registers the redis message handler', () => {
    expect(dispatch).toBeTypeOf('function');
  });

  it('logs parse failures for malformed redis payloads', () => {
    dispatch('agent-chat', '{not-json');

    expect(mockLoggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse Redis message'),
      expect.anything(),
      expect.any(Object),
    );
  });

  it('warns on unknown channels', () => {
    dispatch('bogus-channel', JSON.stringify({}));

    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      'Unknown channel: bogus-channel',
    );
  });

  it('routes agent-chat events to the user room', () => {
    dispatch(
      'agent-chat',
      JSON.stringify({
        data: { threadId: 'thread-1', userId: USER_ID },
        type: 'agent-message',
      }),
    );

    expect(serverTo).toHaveBeenCalledWith(USER_ROOM);
    expect(roomEmit).toHaveBeenCalledWith('agent-message', {
      threadId: 'thread-1',
      userId: USER_ID,
    });
  });

  it('ignores agent-chat events without a userId', () => {
    dispatch(
      'agent-chat',
      JSON.stringify({ data: { threadId: 'thread-1' }, type: 'agent-message' }),
    );

    expect(serverTo).not.toHaveBeenCalled();
  });

  it('emits video progress on both the path and channel events', () => {
    dispatch(
      'video-progress',
      JSON.stringify({
        path: '/videos/v1/progress',
        progress: 42,
        userId: USER_ID,
      }),
    );

    expect(serverTo).toHaveBeenCalledWith(USER_ROOM);
    expect(roomEmit).toHaveBeenCalledWith(
      '/videos/v1/progress',
      expect.objectContaining({ progress: 42, status: 'processing' }),
    );
    expect(roomEmit).toHaveBeenCalledWith(
      'video-progress',
      expect.objectContaining({ progress: 42, status: 'processing' }),
    );
  });

  it('emits video completion to an explicit room override', () => {
    dispatch(
      'video-complete',
      JSON.stringify({
        path: '/videos/v1/complete',
        result: { url: 'https://cdn.example/video.mp4' },
        room: 'custom-room',
        userId: USER_ID,
      }),
    );

    expect(serverTo).toHaveBeenCalledWith('custom-room');
    expect(roomEmit).toHaveBeenCalledWith(
      '/videos/v1/complete',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(roomEmit).toHaveBeenCalledWith(
      'video-complete',
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('emits media failures on both the path and channel events', () => {
    dispatch(
      'media-failed',
      JSON.stringify({
        error: 'render exploded',
        path: '/videos/v1/failed',
        userId: USER_ID,
      }),
    );

    expect(roomEmit).toHaveBeenCalledWith(
      '/videos/v1/failed',
      expect.objectContaining({ error: 'render exploded', status: 'failed' }),
    );
    expect(roomEmit).toHaveBeenCalledWith(
      'media-failed',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('sends notifications to the organization room when an org is present', () => {
    dispatch(
      'notifications',
      JSON.stringify({
        notification: { title: 'hello' },
        organizationId: 'org-1',
        userId: USER_ID,
      }),
    );

    expect(serverTo).toHaveBeenCalledWith('org-org-1');
    expect(roomEmit).toHaveBeenCalledWith('notification', { title: 'hello' });
  });

  it('sends notifications to the user room without an org', () => {
    dispatch(
      'notifications',
      JSON.stringify({
        notification: { title: 'hello' },
        userId: USER_ID,
      }),
    );

    expect(serverTo).toHaveBeenCalledWith(USER_ROOM);
    expect(roomEmit).toHaveBeenCalledWith('notification', { title: 'hello' });
  });

  it('drops notifications without a user or org target', () => {
    dispatch(
      'notifications',
      JSON.stringify({ notification: { title: 'hello' } }),
    );

    expect(serverTo).not.toHaveBeenCalled();
  });

  it('routes ingredient status updates', () => {
    dispatch(
      'ingredient-status',
      JSON.stringify({
        ingredientId: 'ing-1',
        metadata: { source: 'test' },
        status: 'READY',
        userId: USER_ID,
      }),
    );

    expect(serverTo).toHaveBeenCalledWith(USER_ROOM);
    expect(roomEmit).toHaveBeenCalledWith(
      '/ingredients/ing-1/status',
      expect.objectContaining({ ingredientId: 'ing-1', status: 'READY' }),
    );
  });

  it('routes post status updates', () => {
    dispatch(
      'post-status',
      JSON.stringify({
        postId: 'post-1',
        status: 'published',
        userId: USER_ID,
      }),
    );

    expect(roomEmit).toHaveBeenCalledWith(
      '/posts/post-1/status',
      expect.objectContaining({ postId: 'post-1', status: 'published' }),
    );
  });

  it('routes training status updates', () => {
    dispatch(
      'training-status',
      JSON.stringify({
        progress: 80,
        status: 'PROCESSING',
        trainingId: 'train-1',
        userId: USER_ID,
      }),
    );

    expect(roomEmit).toHaveBeenCalledWith(
      '/trainings/train-1/status',
      expect.objectContaining({ progress: 80, trainingId: 'train-1' }),
    );
  });

  it('routes file processing updates', () => {
    dispatch(
      'file-processing',
      JSON.stringify({
        ingredientId: 'ing-1',
        jobId: 'job-1',
        progress: 10,
        status: 'processing',
        type: 'thumbnail',
        userId: USER_ID,
      }),
    );

    expect(roomEmit).toHaveBeenCalledWith(
      '/files/ing-1/thumbnail',
      expect.objectContaining({ jobId: 'job-1', type: 'thumbnail' }),
    );
  });

  it('routes asset status updates', () => {
    dispatch(
      'asset-status',
      JSON.stringify({
        assetId: 'asset-1',
        status: 'READY',
        userId: USER_ID,
      }),
    );

    expect(roomEmit).toHaveBeenCalledWith(
      'asset-status',
      expect.objectContaining({ assetId: 'asset-1', status: 'READY' }),
    );
  });

  it('routes article status updates', () => {
    dispatch(
      'article-status',
      JSON.stringify({
        articleId: 'article-1',
        status: 'PUBLISHED',
        userId: USER_ID,
      }),
    );

    expect(roomEmit).toHaveBeenCalledWith(
      'article-status',
      expect.objectContaining({ articleId: 'article-1', status: 'PUBLISHED' }),
    );
  });

  it('routes background task updates to the target room', () => {
    dispatch(
      'background-task-update',
      JSON.stringify({
        room: 'task-room',
        status: 'running',
        userId: USER_ID,
      }),
    );

    expect(serverTo).toHaveBeenCalledWith('task-room');
    expect(roomEmit).toHaveBeenCalledWith(
      'background-task-update',
      expect.objectContaining({ status: 'running' }),
    );
  });

  it('routes generic events to an explicit room', () => {
    dispatch(
      'generic-events',
      JSON.stringify({
        data: { room: 'room-1', value: 1 },
        path: '/generic/path',
      }),
    );

    expect(serverTo).toHaveBeenCalledWith('room-1');
    expect(roomEmit).toHaveBeenCalledWith(
      '/generic/path',
      expect.objectContaining({ value: 1 }),
    );
  });

  it('routes generic events to the user room when only userId is present', () => {
    dispatch(
      'generic-events',
      JSON.stringify({
        data: { userId: USER_ID, value: 2 },
        path: '/generic/path',
      }),
    );

    expect(serverTo).toHaveBeenCalledWith(USER_ROOM);
    expect(roomEmit).toHaveBeenCalledWith(
      '/generic/path',
      expect.objectContaining({ value: 2 }),
    );
  });

  it('broadcasts generic events without a target', () => {
    dispatch(
      'generic-events',
      JSON.stringify({ data: null, path: '/generic/broadcast' }),
    );

    expect(serverEmit).toHaveBeenCalledWith(
      '/generic/broadcast',
      expect.objectContaining({ timestamp: expect.any(String) }),
    );
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('Broadcast generic event'),
    );
  });

  it('emits directly to users and organizations when the server is ready', () => {
    gateway.emitToUser(USER_ID, 'direct-event', { value: 1 });
    gateway.emitToOrganization('org-1', 'org-event', { value: 2 });

    expect(serverTo).toHaveBeenCalledWith(USER_ROOM);
    expect(roomEmit).toHaveBeenCalledWith('direct-event', { value: 1 });
    expect(serverTo).toHaveBeenCalledWith('org-org-1');
    expect(roomEmit).toHaveBeenCalledWith('org-event', { value: 2 });
  });

  it('tracks connections and cleans up on disconnect', async () => {
    mockConfigService.get.mockReturnValue('http://localhost:3010');
    verifyMock.mockResolvedValue({ organizationId: 'org-1', sub: USER_ID });

    const first = createVerifiedSocket('socket-1');
    const second = createVerifiedSocket('socket-2');
    await gateway.handleConnection(first as Socket);
    await gateway.handleConnection(second as Socket);

    expect(gateway.getConnectionStatus()).toEqual({
      totalClients: 2,
      totalUsers: 1,
      users: [{ connections: 2, userId: USER_ID }],
    });

    gateway.handleDisconnect(first as Socket);

    expect(gateway.getConnectionStatus()).toEqual({
      totalClients: 1,
      totalUsers: 1,
      users: [{ connections: 1, userId: USER_ID }],
    });

    gateway.handleDisconnect(second as Socket);

    expect(gateway.getConnectionStatus()).toEqual({
      totalClients: 0,
      totalUsers: 0,
      users: [],
    });
  });

  it('publishes client messages back to the api over redis', async () => {
    mockConfigService.get.mockReturnValue('http://localhost:3010');
    verifyMock.mockResolvedValue({ organizationId: 'org-1', sub: USER_ID });
    mockRedisService.publish.mockResolvedValue(undefined);

    const socket = createVerifiedSocket('socket-1');
    await gateway.handleConnection(socket as Socket);

    await expect(
      gateway.handleIngredientUpdate(
        { data: {}, ingredientId: 'ing-1' },
        socket as Socket,
      ),
    ).resolves.toEqual({ message: 'Request sent', success: true });
    expect(mockRedisService.publish).toHaveBeenCalledWith(
      'api:ingredient:update',
      expect.objectContaining({ socketId: 'socket-1', userId: USER_ID }),
    );

    await expect(
      gateway.handlePostUpdate(
        { data: {}, postId: 'post-1' },
        socket as Socket,
      ),
    ).resolves.toEqual({ message: 'Request sent', success: true });
    expect(mockRedisService.publish).toHaveBeenCalledWith(
      'api:post:update',
      expect.objectContaining({ socketId: 'socket-1' }),
    );

    await expect(
      gateway.handleVoteCreate(
        { targetId: 'post-1', value: 1 },
        socket as Socket,
      ),
    ).resolves.toEqual({ message: 'Request sent', success: true });
    expect(mockRedisService.publish).toHaveBeenCalledWith(
      'api:vote:create',
      expect.objectContaining({ socketId: 'socket-1' }),
    );

    await expect(
      gateway.handleSubscriptionUpdate(
        { action: 'upgrade', subscriptionId: 'sub-1' },
        socket as Socket,
      ),
    ).resolves.toEqual({ message: 'Request sent', success: true });
    expect(mockRedisService.publish).toHaveBeenCalledWith(
      'api:subscription:update',
      expect.objectContaining({
        organizationId: 'org-1',
        socketId: 'socket-1',
        userId: USER_ID,
      }),
    );
  });

  it('authorizes later client messages as the rotated identity', async () => {
    const nextUserId = 'bbbbbbbb-0000-0000-0000-000000000002';
    mockConfigService.get.mockReturnValue('http://localhost:3010');
    verifyMock
      .mockResolvedValueOnce({ organizationId: 'org-1', sub: USER_ID })
      .mockResolvedValueOnce({
        organizationId: 'org-2',
        sub: nextUserId,
      });
    mockRedisService.publish.mockResolvedValue(undefined);

    const socket = createVerifiedSocket('socket-1');
    await gateway.handleConnection(socket as Socket);

    await gateway.handleIdentityRotate({ token: 'token-b' }, socket as Socket);

    await expect(
      gateway.handleIngredientUpdate(
        { data: {}, ingredientId: 'ing-1' },
        socket as Socket,
      ),
    ).resolves.toEqual({ message: 'Request sent', success: true });

    expect(socket.leave).toHaveBeenCalledWith(USER_ROOM);
    expect(socket.leave).toHaveBeenCalledWith('org-org-1');
    expect(socket.join).toHaveBeenCalledWith(`user:${nextUserId}`);
    expect(socket.join).toHaveBeenCalledWith('org-org-2');
    expect(mockRedisService.publish).toHaveBeenCalledWith(
      'api:ingredient:update',
      expect.objectContaining({
        socketId: 'socket-1',
        userId: nextUserId,
      }),
    );
    expect(mockRedisService.publish).not.toHaveBeenCalledWith(
      'api:ingredient:update',
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  it('rejects client messages after a failed identity rotation', async () => {
    mockConfigService.get.mockReturnValue('http://localhost:3010');
    verifyMock
      .mockResolvedValueOnce({ organizationId: 'org-1', sub: USER_ID })
      .mockRejectedValueOnce(new Error('invalid signature'));

    const socket = createVerifiedSocket('socket-1');
    await gateway.handleConnection(socket as Socket);

    await gateway.handleIdentityRotate({ token: 'bad' }, socket as Socket);

    await expect(
      gateway.handleIngredientUpdate({}, socket as Socket),
    ).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockRedisService.publish).not.toHaveBeenCalled();
  });

  it('rejects client messages from unauthenticated sockets', async () => {
    const socket = createVerifiedSocket('unknown-socket');

    await expect(
      gateway.handleIngredientUpdate({}, socket as Socket),
    ).resolves.toEqual({ error: 'Unauthorized' });
    await expect(
      gateway.handlePostUpdate({}, socket as Socket),
    ).resolves.toEqual({ error: 'Unauthorized' });
    await expect(
      gateway.handleVoteCreate({}, socket as Socket),
    ).resolves.toEqual({ error: 'Unauthorized' });
    await expect(
      gateway.handleSubscriptionUpdate({}, socket as Socket),
    ).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockRedisService.publish).not.toHaveBeenCalled();
  });
});

describe('WebSocketGateway with an unready server', () => {
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

  let gateway: WebSocketGateway;
  let dispatch: (channel: string, message: string) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    gateway = new WebSocketGateway(
      mockConfigService,
      mockRedisService as unknown as RedisService,
      mockLoggerService as unknown as LoggerService,
    );
    // A server without a `to` method never becomes operational.
    gateway.afterInit({} as unknown as Server);
    vi.advanceTimersByTime(100);

    const messageCall = mockRedisService.on.mock.calls.find(
      ([event]) => event === 'message',
    );
    dispatch = messageCall?.[1] as unknown as (
      channel: string,
      message: string,
    ) => void;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    ['agent-chat', { data: { userId: 'u1' }, type: 't' }],
    ['video-progress', { path: '/p', progress: 1, userId: 'u1' }],
    ['video-complete', { path: '/p', result: {}, userId: 'u1' }],
    ['media-failed', { error: 'x', path: '/p', userId: 'u1' }],
    ['notifications', { notification: {}, userId: 'u1' }],
    ['ingredient-status', { ingredientId: 'i', status: 's', userId: 'u1' }],
    ['post-status', { postId: 'p', status: 's', userId: 'u1' }],
    ['training-status', { status: 's', trainingId: 't', userId: 'u1' }],
    [
      'file-processing',
      { ingredientId: 'i', jobId: 'j', status: 's', type: 't', userId: 'u1' },
    ],
    ['asset-status', { assetId: 'a', status: 's', userId: 'u1' }],
    ['article-status', { articleId: 'a', status: 's', userId: 'u1' }],
    ['background-task-update', { status: 's', userId: 'u1' }],
    ['generic-events', { data: {}, path: '/p' }],
  ])('skips %s events while the server is not ready', (channel, payload) => {
    dispatch(channel, JSON.stringify(payload));

    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('WebSocket server not initialized'),
      expect.any(Object),
    );
  });

  it('skips direct emits while the server is not ready', () => {
    gateway.emitToUser('u1', 'event', {});
    gateway.emitToOrganization('org-1', 'event', {});

    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      'WebSocket server not ready, skipping emitToUser',
      expect.any(Object),
    );
    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      'WebSocket server not ready, skipping emitToOrganization',
      expect.any(Object),
    );
  });
});
