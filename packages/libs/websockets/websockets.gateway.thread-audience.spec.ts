import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { WebSocketGateway } from '@libs/websockets/websockets.gateway';
import { Server } from 'socket.io';
import { type Socket as ClientSocket, io as connect } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const IDENTITIES: Record<string, { organizationId?: string; sub: string }> = {
  'alice-in-org-a': { organizationId: 'org-a', sub: 'user-alice' },
  'alice-in-org-b': { organizationId: 'org-b', sub: 'user-alice' },
  'bob-in-org-a': { organizationId: 'org-a', sub: 'user-bob' },
  'carol-in-org-a': { organizationId: 'org-a', sub: 'user-carol' },
  'dave-in-org-b': { organizationId: 'org-b', sub: 'user-dave' },
};

const verifyMock = vi.hoisted(() => vi.fn());

vi.mock('@libs/auth/better-auth-jwks.verifier', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@libs/auth/better-auth-jwks.verifier')
    >();
  return {
    ...actual,
    BetterAuthJwksVerifier: class {
      verify = verifyMock;
    },
  };
});

const TOKEN_EVENT = 'agent:token';
const STATUS_EVENT = 'agent:thread_status';
const REVOKED_EVENT = 'agent:thread_access_revoked';

interface Delivery {
  data: Record<string, unknown>;
  type: string;
}

describe('WebSocketGateway shared thread delivery (#9938)', () => {
  let httpServer: HttpServer;
  let ioServer: Server;
  let dispatch: (channel: string, message: string) => void;
  let clients: ClientSocket[];
  let received: Map<string, Delivery[]>;

  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  async function connectAs(token: string): Promise<void> {
    const client = connect(
      `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`,
      { auth: { token }, forceNew: true, transports: ['websocket'] },
    );
    clients.push(client);
    received.set(token, []);
    for (const type of [TOKEN_EVENT, STATUS_EVENT, REVOKED_EVENT]) {
      client.on(type, (data: Record<string, unknown>) =>
        received.get(token)?.push({ data, type }),
      );
    }
    await new Promise<void>((resolve, reject) => {
      client.once('connected', () => resolve());
      client.once('connect_error', reject);
    });
  }

  function publish(type: string, data: Record<string, unknown>): void {
    dispatch('agent-chat', JSON.stringify({ data, type }));
  }

  const token = (recipientUserIds?: string[], organizationId = 'org-a') => ({
    organizationId,
    ...(recipientUserIds ? { recipientUserIds } : {}),
    threadId: 'thread-1',
    token: 'hello',
    userId: 'user-alice',
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
  const typesFor = (name: string) =>
    (received.get(name) ?? []).map((delivery) => delivery.type);

  beforeEach(async () => {
    clients = [];
    received = new Map();
    verifyMock.mockImplementation(async (value: string) => {
      const identity = IDENTITIES[value];
      if (!identity) throw new Error('invalid token');
      return identity;
    });

    const redis = { on: vi.fn(), publish: vi.fn(), subscribe: vi.fn() };
    const gateway = new WebSocketGateway(
      { get: (key) => (key === 'GENFEED_CLOUD' ? 'true' : undefined) },
      redis as unknown as RedisService,
      logger,
    );

    httpServer = createServer();
    ioServer = new Server(httpServer);
    ioServer.on('connection', (socket) => {
      void gateway.handleConnection(socket);
    });
    await new Promise<void>((resolve) =>
      httpServer.listen(0, '127.0.0.1', resolve),
    );

    gateway.afterInit(ioServer);
    await vi.waitFor(() => expect(redis.on).toHaveBeenCalled());
    dispatch = redis.on.mock.calls.find(([event]) => event === 'message')?.[1];
  });

  afterEach(async () => {
    for (const client of clients) client.close();
    await ioServer.close();
    vi.restoreAllMocks();
  });

  it('delivers a stream event to every member the API named, and to no one else', async () => {
    await connectAs('alice-in-org-a');
    await connectAs('bob-in-org-a');
    await connectAs('carol-in-org-a');
    await connectAs('dave-in-org-b');

    publish(TOKEN_EVENT, token(['user-alice', 'user-bob']));
    await settle();

    expect(typesFor('alice-in-org-a')).toEqual([TOKEN_EVENT]);
    expect(typesFor('bob-in-org-a')).toEqual([TOKEN_EVENT]);
    expect(typesFor('carol-in-org-a')).toEqual([]);
    expect(typesFor('dave-in-org-b')).toEqual([]);
  });

  it('keeps the audience list off the sockets', async () => {
    await connectAs('bob-in-org-a');

    publish(TOKEN_EVENT, token(['user-alice', 'user-bob']));
    await settle();

    expect(received.get('bob-in-org-a')?.[0]?.data).toEqual({
      organizationId: 'org-a',
      threadId: 'thread-1',
      token: 'hello',
      userId: 'user-alice',
    });
  });

  it('never reaches a named member through their socket for another organization', async () => {
    await connectAs('alice-in-org-a');
    await connectAs('alice-in-org-b');

    publish(TOKEN_EVENT, token(['user-alice']));
    await settle();

    expect(typesFor('alice-in-org-a')).toEqual([TOKEN_EVENT]);
    expect(typesFor('alice-in-org-b')).toEqual([]);
  });

  it('delivers a thread status to every named member and not to the rest', async () => {
    await connectAs('alice-in-org-a');
    await connectAs('bob-in-org-a');
    await connectAs('carol-in-org-a');

    publish(STATUS_EVENT, {
      organizationId: 'org-a',
      pendingInputCount: 0,
      recipientUserIds: ['user-alice', 'user-bob'],
      runStatus: 'running',
      runtimeState: 'running',
      sequence: 4,
      threadId: 'thread-1',
      timestamp: '2026-11-11T10:00:00.000Z',
      userId: 'user-alice',
    });
    await settle();

    expect(typesFor('alice-in-org-a')).toEqual([STATUS_EVENT]);
    expect(typesFor('bob-in-org-a')).toEqual([STATUS_EVENT]);
    expect(typesFor('carol-in-org-a')).toEqual([]);
    expect(received.get('bob-in-org-a')?.[0]?.data).not.toHaveProperty(
      'recipientUserIds',
    );
  });

  it('tells a member their access ended and sends them nothing further for that thread', async () => {
    await connectAs('alice-in-org-a');
    await connectAs('bob-in-org-a');

    publish(TOKEN_EVENT, token(['user-alice', 'user-bob']));
    await settle();
    publish(REVOKED_EVENT, {
      organizationId: 'org-a',
      threadId: 'thread-1',
      timestamp: '2026-11-11T10:00:01.000Z',
      userId: 'user-bob',
    });
    await settle();
    // Another API process still holds the audience from before the removal.
    publish(TOKEN_EVENT, token(['user-alice', 'user-bob']));
    await settle();

    expect(typesFor('bob-in-org-a')).toEqual([TOKEN_EVENT, REVOKED_EVENT]);
    expect(typesFor('alice-in-org-a')).toEqual([TOKEN_EVENT, TOKEN_EVENT]);
  });

  it('keeps delivering other threads to a member whose access to one ended', async () => {
    await connectAs('bob-in-org-a');

    publish(REVOKED_EVENT, {
      organizationId: 'org-a',
      threadId: 'thread-1',
      timestamp: '2026-11-11T10:00:01.000Z',
      userId: 'user-bob',
    });
    await settle();
    publish(TOKEN_EVENT, { ...token(['user-bob']), threadId: 'thread-2' });
    await settle();

    expect(typesFor('bob-in-org-a')).toEqual([REVOKED_EVENT, TOKEN_EVENT]);
  });

  it('reaches only the revoked member with the revoke, and only in the thread organization', async () => {
    await connectAs('alice-in-org-a');
    await connectAs('bob-in-org-a');
    await connectAs('alice-in-org-b');

    publish(REVOKED_EVENT, {
      organizationId: 'org-a',
      threadId: 'thread-1',
      timestamp: '2026-11-11T10:00:01.000Z',
      userId: 'user-alice',
    });
    await settle();

    expect(typesFor('alice-in-org-a')).toEqual([REVOKED_EVENT]);
    expect(typesFor('bob-in-org-a')).toEqual([]);
    expect(typesFor('alice-in-org-b')).toEqual([]);
  });
});
