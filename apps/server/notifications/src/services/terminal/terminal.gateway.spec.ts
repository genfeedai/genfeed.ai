import type { Socket } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalGateway } from './terminal.gateway';

const verifyTokenMock = vi.hoisted(() => vi.fn());

vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
}));

vi.mock('./terminal.service', () => ({
  TerminalService: class TerminalService {},
}));

function createSocket(origin?: string, token?: string): Socket {
  return {
    disconnect: vi.fn(),
    emit: vi.fn(),
    handshake: {
      auth: token ? { token } : {},
      address: '127.0.0.1',
      headers: origin ? { origin } : {},
    },
    id: 'socket-1',
  } as unknown as Socket;
}

function createTerminalService(isAvailable = true) {
  return {
    attach: vi.fn(),
    createSession: vi.fn(),
    getClerkSecretKey: vi.fn(() => 'test-clerk-secret'),
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
    verifyTokenMock.mockResolvedValue({ sub: 'user_123' });
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

    expect(verifyTokenMock).toHaveBeenCalledWith('session-token', {
      secretKey: 'test-clerk-secret',
    });
    expect(socket.emit).toHaveBeenCalledWith('terminal:ready', {
      socketId: 'socket-1',
    });
    expect(socket.disconnect).not.toHaveBeenCalled();
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

    expect(terminalService.listForOwner).toHaveBeenCalledWith('user_123');
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
      'user_123',
      'session-abc',
      expect.objectContaining({
        onData: expect.any(Function),
        onExit: expect.any(Function),
      }),
    );
    expect(socket.emit).toHaveBeenCalledWith('terminal:attached', fakeSession);
  });
});
