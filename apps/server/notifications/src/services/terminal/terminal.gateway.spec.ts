import type { Socket } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalGateway } from './terminal.gateway';

const fetchMock = vi.hoisted(() => vi.fn());
const verifyMock = vi.hoisted(() => vi.fn());

/** A Better Auth `sub` is the genfeed User.id (a UUID), not a legacy auth provider user id. */
const TEST_USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

vi.mock('@libs/auth/better-auth-jwks.verifier', () => ({
  BetterAuthJwksVerifier: class {
    verify = verifyMock;
  },
}));

vi.mock('./terminal.service', () => ({
  TerminalService: class TerminalService {},
}));

function createSocket(
  origin?: string,
  token?: string,
  cookie?: string,
): Socket {
  return {
    disconnect: vi.fn(),
    emit: vi.fn(),
    handshake: {
      auth: token ? { token } : {},
      address: '127.0.0.1',
      headers: {
        ...(origin ? { origin } : {}),
        ...(cookie ? { cookie } : {}),
      },
    },
    id: 'socket-1',
  } as unknown as Socket;
}

function createTerminalService(isAvailable = true) {
  return {
    attach: vi.fn(),
    createSession: vi.fn(),
    getBetterAuthJwksUrl: vi.fn(() => 'http://localhost:3010/v1/auth/jwks'),
    getBetterAuthJwksVerifierOptions: vi.fn(() => ({
      audience: 'http://localhost:3010',
      issuer: 'http://localhost:3010',
      jwksUrl: 'http://localhost:3010/v1/auth/jwks',
    })),
    getBetterAuthTokenUrl: vi.fn(() => 'http://localhost:3010/v1/auth/token'),
    isAvailable: vi.fn(() => isAvailable),
    killAllForSocket: vi.fn(),
    killSession: vi.fn(),
    listForOwner: vi.fn(() => []),
    resizeSession: vi.fn(),
    writeSession: vi.fn(),
  };
}

describe('TerminalGateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      json: async () => ({ token: 'cookie-token' }),
      ok: true,
      status: 200,
    });
    verifyMock.mockResolvedValue({ sub: TEST_USER_ID });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects originless terminal socket connections', async () => {
    const terminalService = createTerminalService();
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket();

    await gateway.handleConnection(socket);

    expect(socket.emit).toHaveBeenCalledWith('terminal:error', {
      message: 'Local terminal only accepts localhost origins.',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(terminalService.isAvailable).not.toHaveBeenCalled();
  });

  it('rejects localhost origins without an authenticated token', async () => {
    const terminalService = createTerminalService();
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket('http://localhost:3000');

    await gateway.handleConnection(socket);

    expect(socket.emit).toHaveBeenCalledWith('terminal:error', {
      message: 'Local terminal requires an authenticated session.',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(terminalService.isAvailable).not.toHaveBeenCalled();
  });

  it('accepts localhost origins with a verified session token when the terminal service is available', async () => {
    const terminalService = createTerminalService();
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket('http://localhost:3000', 'session-token');

    await gateway.handleConnection(socket);

    expect(verifyMock).toHaveBeenCalledWith('session-token');
    expect(socket.emit).toHaveBeenCalledWith('terminal:ready', {
      socketId: 'socket-1',
    });
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('accepts localhost origins by minting a token from the Better Auth session cookie', async () => {
    const terminalService = createTerminalService();
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket(
      'http://localhost:3000',
      undefined,
      'better-auth.session_token=session-123',
    );

    await gateway.handleConnection(socket);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3010/v1/auth/token',
      expect.objectContaining({
        headers: { cookie: 'better-auth.session_token=session-123' },
      }),
    );
    expect(verifyMock).toHaveBeenCalledWith('cookie-token');
    expect(socket.emit).toHaveBeenCalledWith('terminal:ready', {
      socketId: 'socket-1',
    });
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('falls back to the session cookie when the socket token fails verification', async () => {
    verifyMock
      .mockRejectedValueOnce(new Error('invalid signature'))
      .mockResolvedValueOnce({ sub: TEST_USER_ID });
    const terminalService = createTerminalService();
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket(
      'http://localhost:3000',
      'stale-token',
      'better-auth.session_token=session-123',
    );

    await gateway.handleConnection(socket);

    expect(verifyMock).toHaveBeenNthCalledWith(1, 'stale-token');
    expect(verifyMock).toHaveBeenNthCalledWith(2, 'cookie-token');
    expect(socket.emit).toHaveBeenCalledWith('terminal:ready', {
      socketId: 'socket-1',
    });
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('rejects the connection when Better Auth verification throws', async () => {
    verifyMock.mockRejectedValue(new Error('invalid signature'));
    const terminalService = createTerminalService();
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket('http://localhost:3000', 'bad-token');

    await gateway.handleConnection(socket);

    expect(verifyMock).toHaveBeenCalledWith('bad-token');
    expect(socket.emit).toHaveBeenCalledWith('terminal:error', {
      message: 'Local terminal requires an authenticated session.',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.emit).not.toHaveBeenCalledWith('terminal:ready', {
      socketId: 'socket-1',
    });
  });

  it('rejects terminal events from sockets that have not completed authentication', () => {
    const terminalService = createTerminalService();
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket('http://localhost:3000', 'session-token');

    gateway.handleCreate(socket, { kind: 'shell' });

    expect(socket.emit).toHaveBeenCalledWith('terminal:error', {
      message: 'Local terminal requires an authenticated session.',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(terminalService.createSession).not.toHaveBeenCalled();
  });

  it('accepts portless worktree origins with a verified session token when the terminal service is available', async () => {
    const terminalService = createTerminalService();
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket(
      'https://feat-123.app.genfeed.localhost',
      'session-token',
    );

    await gateway.handleConnection(socket);

    expect(socket.emit).toHaveBeenCalledWith('terminal:ready', {
      socketId: 'socket-1',
    });
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('emits terminal:sessions in response to terminal:list', async () => {
    const terminalService = createTerminalService();
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket('http://localhost:3000', 'session-token');

    await gateway.handleConnection(socket);
    gateway.handleList(socket);

    expect(terminalService.listForOwner).toHaveBeenCalledWith(TEST_USER_ID);
    expect(socket.emit).toHaveBeenCalledWith('terminal:sessions', []);
  });

  it('emits terminal:error when attach session is not found', async () => {
    const terminalService = createTerminalService();
    terminalService.attach.mockReturnValue(null);
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket('http://localhost:3000', 'session-token');

    await gateway.handleConnection(socket);
    gateway.handleAttach(socket, { sessionId: 'nonexistent' });

    expect(socket.emit).toHaveBeenCalledWith('terminal:error', {
      message: 'Session nonexistent not found or access denied.',
    });
  });

  it('emits terminal:attached when attach succeeds', async () => {
    const fakeSession = {
      command: 'zsh',
      createdAt: '2026-01-01T00:00:00.000Z',
      cwd: '/home/user',
      id: 'session-abc',
      kind: 'shell',
      pid: 9999,
    };
    const terminalService = createTerminalService();
    terminalService.attach.mockReturnValue(fakeSession);
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket('http://localhost:3000', 'session-token');

    await gateway.handleConnection(socket);
    gateway.handleAttach(socket, { sessionId: 'session-abc' });

    expect(terminalService.attach).toHaveBeenCalledWith(
      'socket-1',
      TEST_USER_ID,
      'session-abc',
      expect.objectContaining({
        onData: expect.any(Function),
        onExit: expect.any(Function),
      }),
    );
    expect(socket.emit).toHaveBeenCalledWith('terminal:attached', fakeSession);
  });
});
