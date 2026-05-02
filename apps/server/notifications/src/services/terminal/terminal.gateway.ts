import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { TerminalService } from './terminal.service';
import type {
  TerminalCreatePayload,
  TerminalKillPayload,
  TerminalResizePayload,
  TerminalWritePayload,
} from './terminal.types';

const LOCAL_ORIGIN_HOSTS = new Set([
  '127.0.0.1',
  '::1',
  'localhost',
  'local.genfeed.ai',
]);

@WebSocketGateway({
  namespace: '/terminal',
})
export class TerminalGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(TerminalGateway.name);

  constructor(private readonly terminalService: TerminalService) {}

  handleConnection(client: Socket): void {
    if (!this.isAllowedLocalOrigin(client)) {
      this.logger.warn('Rejected non-local terminal socket connection', {
        address: client.handshake.address,
        origin: client.handshake.headers.origin,
        socketId: client.id,
      });
      client.emit('terminal:error', {
        message: 'Local terminal only accepts localhost origins.',
      });
      client.disconnect(true);
      return;
    }

    if (!this.terminalService.isAvailable()) {
      client.emit('terminal:error', {
        message: 'Local terminal is disabled.',
      });
      client.disconnect(true);
      return;
    }

    client.emit('terminal:ready', { socketId: client.id });
  }

  handleDisconnect(client: Socket): void {
    this.terminalService.killAllForSocket(client.id);
  }

  @SubscribeMessage('terminal:create')
  handleCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: TerminalCreatePayload,
  ): void {
    try {
      const session = this.terminalService.createSession(client.id, payload, {
        onData: (data) => client.emit('terminal:data', data),
        onExit: (exit) => client.emit('terminal:exit', exit),
      });
      client.emit('terminal:created', session);
    } catch (error) {
      client.emit('terminal:error', {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to start local terminal.',
      });
    }
  }

  @SubscribeMessage('terminal:kill')
  handleKill(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalKillPayload,
  ): void {
    this.terminalService.killSession(client.id, payload.sessionId);
  }

  @SubscribeMessage('terminal:resize')
  handleResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalResizePayload,
  ): void {
    this.terminalService.resizeSession(
      client.id,
      payload.sessionId,
      payload.cols,
      payload.rows,
    );
  }

  @SubscribeMessage('terminal:write')
  handleWrite(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalWritePayload,
  ): void {
    this.terminalService.writeSession(
      client.id,
      payload.sessionId,
      payload.data,
    );
  }

  private isAllowedLocalOrigin(client: Socket): boolean {
    const origin = client.handshake.headers.origin;

    if (!origin) {
      return true;
    }

    try {
      return LOCAL_ORIGIN_HOSTS.has(new URL(origin).hostname);
    } catch {
      return false;
    }
  }
}
