import type { Socket } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalGateway } from './terminal.gateway';

function createSocket(origin?: string): Socket {
  return {
    disconnect: vi.fn(),
    emit: vi.fn(),
    handshake: {
      address: '127.0.0.1',
      headers: origin ? { origin } : {},
    },
    id: 'socket-1',
  } as unknown as Socket;
}

function createTerminalService(isAvailable = true) {
  return {
    createSession: vi.fn(),
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
  });

  it('rejects originless terminal socket connections', () => {
    const terminalService = createTerminalService();
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket();

    gateway.handleConnection(socket);

    expect(socket.emit).toHaveBeenCalledWith('terminal:error', {
      message: 'Local terminal only accepts localhost origins.',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(terminalService.isAvailable).not.toHaveBeenCalled();
  });

  it('accepts localhost origins when the terminal service is available', () => {
    const terminalService = createTerminalService();
    const gateway = new TerminalGateway(terminalService as never);
    const socket = createSocket('http://localhost:3000');

    gateway.handleConnection(socket);

    expect(socket.emit).toHaveBeenCalledWith('terminal:ready', {
      socketId: 'socket-1',
    });
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
