import type { Socket } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalGateway } from './terminal.gateway';

const verifyTokenMock = vi.hoisted(() => vi.fn());

vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
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
    createSession: vi.fn(),
    getClerkSecretKey: vi.fn(() => 'test-clerk-secret'),
    isAvailable: vi.fn(() => isAvailable),
    killAllForSocket: vi.fn(),
    killSession: vi.fn(),
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
});
