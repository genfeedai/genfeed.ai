import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AgentThreadStatusEvent } from '@genfeedai/contracts/interfaces';
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
  'carol-in-org-b': { organizationId: 'org-b', sub: 'user-carol' },
  'dave-no-org': { sub: 'user-dave' },
};

const verifyMock = vi.hoisted(() => vi.fn());
const metrics = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock('@libs/websockets/agent-thread-status.metrics', () => ({
  countAgentThreadStatus: metrics.count,
}));

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

const STATUS_EVENT = 'agent:thread_status';

function statusEvent(
  overrides: Partial<AgentThreadStatusEvent> = {},
): AgentThreadStatusEvent {
  return {
    organizationId: 'org-a',
    pendingInputCount: 0,
    runStatus: 'running',
    runtimeState: 'running' as AgentThreadStatusEvent['runtimeState'],
    sequence: 3,
    threadId: 'thread-1',
    timestamp: '2026-09-29T10:00:00.000Z',
    userId: 'user-alice',
    ...overrides,
  };
}

describe('WebSocketGateway agent thread status (#5636)', () => {
  let httpServer: HttpServer;
  let ioServer: Server;
  let dispatch: (channel: string, message: string) => void;
  let isCloud: boolean;
  let clients: ClientSocket[];
  let received: Map<string, AgentThreadStatusEvent[]>;

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
    client.on(STATUS_EVENT, (event: AgentThreadStatusEvent) =>
      received.get(token)?.push(event),
    );
    await new Promise<void>((resolve, reject) => {
      client.once('connected', () => resolve());
      client.once('disconnect', () => reject(new Error(`${token} rejected`)));
      client.once('connect_error', reject);
    });
  }

  function publish(data: Partial<AgentThreadStatusEvent>): void {
    dispatch('agent-chat', JSON.stringify({ data, type: STATUS_EVENT }));
  }

  /** Let every emitted packet reach every connected client. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

  beforeEach(async () => {
    metrics.count.mockReset();
    clients = [];
    received = new Map();
    isCloud = true;
    verifyMock.mockImplementation(async (token: string) => {
      const identity = IDENTITIES[token];
      if (!identity) throw new Error('invalid token');
      return identity;
    });

    const redis = { on: vi.fn(), subscribe: vi.fn(), publish: vi.fn() };
    const gateway = new WebSocketGateway(
      { get: (key) => (key === 'GENFEED_CLOUD' ? String(isCloud) : undefined) },
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

  it('delivers a thread status to its owner authenticated for the thread organization', async () => {
    await connectAs('alice-in-org-a');

    publish(statusEvent());
    await settle();

    expect(received.get('alice-in-org-a')).toEqual([statusEvent()]);
  });

  it('delivers nothing to a client authenticated for another organization', async () => {
    await connectAs('alice-in-org-a');
    await connectAs('carol-in-org-b');
    await connectAs('alice-in-org-b');

    publish(statusEvent({ organizationId: 'org-a', userId: 'user-alice' }));
    await settle();

    expect(received.get('alice-in-org-a')).toHaveLength(1);
    // A different tenant's user, and the same user in a different tenant.
    expect(received.get('carol-in-org-b')).toEqual([]);
    expect(received.get('alice-in-org-b')).toEqual([]);
  });

  it('delivers organization B threads only to organization B', async () => {
    await connectAs('alice-in-org-a');
    await connectAs('alice-in-org-b');

    publish(statusEvent({ organizationId: 'org-b', userId: 'user-alice' }));
    await settle();

    expect(received.get('alice-in-org-b')).toHaveLength(1);
    expect(received.get('alice-in-org-a')).toEqual([]);
  });

  it('delivers nothing to other members of the same organization', async () => {
    await connectAs('alice-in-org-a');
    await connectAs('bob-in-org-a');

    publish(statusEvent({ userId: 'user-alice' }));
    await settle();

    expect(received.get('alice-in-org-a')).toHaveLength(1);
    expect(received.get('bob-in-org-a')).toEqual([]);
  });

  it('delivers nothing to a socket that authenticated without an organization on cloud', async () => {
    await connectAs('dave-no-org');

    publish(statusEvent({ userId: 'user-dave' }));
    await settle();

    expect(received.get('dave-no-org')).toEqual([]);
  });

  it('drops an event that does not name its organization', async () => {
    await connectAs('alice-in-org-a');

    publish(statusEvent({ organizationId: undefined }));
    await settle();

    expect(received.get('alice-in-org-a')).toEqual([]);
  });

  it('single-tenant installs reach the owner even without an organization claim', async () => {
    isCloud = false;
    await connectAs('dave-no-org');
    await connectAs('bob-in-org-a');

    publish(
      statusEvent({ organizationId: 'org-default', userId: 'user-dave' }),
    );
    await settle();

    expect(received.get('dave-no-org')).toHaveLength(1);
    expect(metrics.count).toHaveBeenCalledWith('delivered', 1);
    expect(received.get('bob-in-org-a')).toEqual([]);
  });

  it('counts the union of both self-hosted rooms once', async () => {
    isCloud = false;
    await connectAs('alice-in-org-a');
    publish(statusEvent());
    await settle();
    expect(received.get('alice-in-org-a')).toHaveLength(1);
    expect(metrics.count).toHaveBeenCalledWith('delivered', 1);
  });

  it('counts each socket a status event is delivered to', async () => {
    await connectAs('alice-in-org-a');

    publish(statusEvent());
    await settle();

    expect(metrics.count).toHaveBeenCalledWith('delivered', 1);
  });

  it('counts an event dropped for missing scope', async () => {
    await connectAs('alice-in-org-a');

    publish(statusEvent({ organizationId: undefined }));
    await settle();

    expect(metrics.count).toHaveBeenCalledWith('dropped', 1, {
      reason: 'missing_scope',
    });
    expect(metrics.count).not.toHaveBeenCalledWith(
      'delivered',
      expect.anything(),
    );
  });
});
