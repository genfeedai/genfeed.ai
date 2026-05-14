import { verifyToken } from '@clerk/backend';
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
  private readonly authenticatedSockets = new Set<string>();

  constructor(private readonly terminalService: TerminalService) {}

  async handleConnection(client: Socket): Promise<void> {
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

    if (!(await this.isAuthenticatedLocalClient(client))) {
      this.logger.warn('Rejected unauthenticated terminal socket connection', {
        address: client.handshake.address,
        origin: client.handshake.headers.origin,
        socketId: client.id,
      });
      client.emit('terminal:error', {
        message: 'Local terminal requires an authenticated session.',
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

    this.authenticatedSockets.add(client.id);
    client.emit('terminal:ready', { socketId: client.id });
  }

  handleDisconnect(client: Socket): void {
    this.authenticatedSockets.delete(client.id);
    this.terminalService.killAllForSocket(client.id);
  }

  @SubscribeMessage('terminal:create')
  handleCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: TerminalCreatePayload,
  ): void {
    if (!this.ensureAuthenticated(client)) {
      return;
    }

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
    if (!this.ensureAuthenticated(client)) {
      return;
    }

    this.terminalService.killSession(client.id, payload.sessionId);
  }

  @SubscribeMessage('terminal:resize')
  handleResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalResizePayload,
  ): void {
    if (!this.ensureAuthenticated(client)) {
      return;
    }

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
    if (!this.ensureAuthenticated(client)) {
      return;
    }

    this.terminalService.writeSession(
      client.id,
      payload.sessionId,
      payload.data,
    );
  }

  private isAllowedLocalOrigin(client: Socket): boolean {
    const origin = client.handshake.headers.origin;

    if (!origin) {
      return false;
    }

    try {
      return LOCAL_ORIGIN_HOSTS.has(new URL(origin).hostname);
    } catch {
      return false;
    }
  }

  private async isAuthenticatedLocalClient(client: Socket): Promise<boolean> {
    const token = this.extractToken(client);
    if (!token) {
      return false;
    }

    const clerkSecret = this.terminalService.getClerkSecretKey();
    if (!clerkSecret) {
      this.logger.warn(
        'CLERK_SECRET_KEY is required before local terminal sockets can authenticate.',
      );
      return false;
    }

    try {
      const payload = await verifyToken(token, { secretKey: clerkSecret });
      return typeof payload.sub === 'string' && payload.sub.length > 0;
    } catch (error: unknown) {
      this.logger.warn('Failed to verify local terminal socket token', {
        error: error instanceof Error ? error.message : String(error),
        socketId: client.id,
      });
      return false;
    }
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const headerToken = client.handshake.headers.authorization;
    if (typeof headerToken === 'string' && headerToken.startsWith('Bearer ')) {
      return headerToken.slice('Bearer '.length).trim() || undefined;
    }

    return undefined;
  }

  private ensureAuthenticated(client: Socket): boolean {
    if (this.authenticatedSockets.has(client.id)) {
      return true;
    }

    client.emit('terminal:error', {
      message: 'Local terminal requires an authenticated session.',
    });
    client.disconnect(true);
    return false;
  }
}
