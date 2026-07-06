import { BetterAuthJwksVerifier } from '@libs/auth/better-auth-jwks.verifier';
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
  TerminalAttachPayload,
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
const PORTLESS_LOCALHOST_SUFFIX = '.genfeed.localhost';

/** Slim auth record stored per connected socket after successful handshake. */
interface SocketAuthRecord {
  userId: string;
}

interface BetterAuthTokenResponse {
  data?: {
    token?: unknown;
  };
  token?: unknown;
}

@WebSocketGateway({
  namespace: '/terminal',
})
export class TerminalGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(TerminalGateway.name);
  /** Maps socketId → auth record for all authenticated connections. */
  private readonly authenticatedSockets = new Map<string, SocketAuthRecord>();
  /** Lazily built once; `jose` caches the remote JWKS internally. */
  private betterAuthVerifier?: BetterAuthJwksVerifier;

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

    const userId = await this.resolveAuthenticatedUserId(client);
    if (!userId) {
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

    this.authenticatedSockets.set(client.id, { userId });
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
    const auth = this.requireAuthenticated(client);
    if (!auth) {
      return;
    }

    try {
      const session = this.terminalService.createSession(
        client.id,
        auth.userId,
        payload,
        {
          onData: (data) => client.emit('terminal:data', data),
          onExit: (exit) => client.emit('terminal:exit', exit),
        },
      );
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

  @SubscribeMessage('terminal:list')
  handleList(@ConnectedSocket() client: Socket): void {
    const auth = this.requireAuthenticated(client);
    if (!auth) {
      return;
    }

    const sessions = this.terminalService.listForOwner(auth.userId);
    client.emit('terminal:sessions', sessions);
  }

  @SubscribeMessage('terminal:attach')
  handleAttach(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalAttachPayload,
  ): void {
    const auth = this.requireAuthenticated(client);
    if (!auth) {
      return;
    }

    if (!payload?.sessionId) {
      client.emit('terminal:error', { message: 'sessionId is required.' });
      return;
    }

    const session = this.terminalService.attach(
      client.id,
      auth.userId,
      payload.sessionId,
      {
        onData: (data) => client.emit('terminal:data', data),
        onExit: (exit) => client.emit('terminal:exit', exit),
      },
    );

    if (!session) {
      client.emit('terminal:error', {
        message: `Session ${payload.sessionId} not found or access denied.`,
      });
      return;
    }

    client.emit('terminal:attached', session);
  }

  @SubscribeMessage('terminal:kill')
  handleKill(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalKillPayload,
  ): void {
    const auth = this.requireAuthenticated(client);
    if (!auth) {
      return;
    }

    this.terminalService.killSession(client.id, auth.userId, payload.sessionId);
  }

  @SubscribeMessage('terminal:resize')
  handleResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalResizePayload,
  ): void {
    const auth = this.requireAuthenticated(client);
    if (!auth) {
      return;
    }

    this.terminalService.resizeSession(
      client.id,
      auth.userId,
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
    const auth = this.requireAuthenticated(client);
    if (!auth) {
      return;
    }

    this.terminalService.writeSession(
      client.id,
      auth.userId,
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
      const hostname = new URL(origin).hostname;

      return (
        LOCAL_ORIGIN_HOSTS.has(hostname) ||
        hostname.endsWith(PORTLESS_LOCALHOST_SUFFIX)
      );
    } catch {
      return false;
    }
  }

  /**
   * Verifies the socket's Better Auth JWT and returns the genfeed `User.id`
   * (`sub`). Returns null when verification fails.
   */
  private async resolveAuthenticatedUserId(
    client: Socket,
  ): Promise<string | null> {
    const token = this.extractToken(client);

    if (token) {
      const userId = await this.verifyToken(client, token);
      if (userId) {
        return userId;
      }
    }

    const cookieToken = await this.getTokenFromSessionCookie(client);
    if (!cookieToken) {
      return null;
    }

    return this.verifyToken(client, cookieToken);
  }

  private async verifyToken(
    client: Socket,
    token: string,
  ): Promise<string | null> {
    try {
      const { sub } = await this.getBetterAuthVerifier().verify(token);
      return sub;
    } catch (error: unknown) {
      this.logger.warn('Failed to verify local terminal socket token', {
        error: error instanceof Error ? error.message : String(error),
        socketId: client.id,
      });
      return null;
    }
  }

  private async getTokenFromSessionCookie(
    client: Socket,
  ): Promise<string | null> {
    const cookie = this.extractCookieHeader(client);
    if (!cookie) {
      return null;
    }

    try {
      const response = await fetch(
        this.terminalService.getBetterAuthTokenUrl(),
        {
          cache: 'no-store',
          headers: { cookie },
        },
      );

      if (!response.ok) {
        this.logger.warn('Failed to mint terminal socket token from cookie', {
          socketId: client.id,
          status: response.status,
        });
        return null;
      }

      const data = (await response.json()) as BetterAuthTokenResponse;
      return this.extractResponseToken(data);
    } catch (error: unknown) {
      this.logger.warn('Failed to mint terminal socket token from cookie', {
        error: error instanceof Error ? error.message : String(error),
        socketId: client.id,
      });
      return null;
    }
  }

  private getBetterAuthVerifier(): BetterAuthJwksVerifier {
    if (!this.betterAuthVerifier) {
      this.betterAuthVerifier = new BetterAuthJwksVerifier(
        this.terminalService.getBetterAuthJwksVerifierOptions(),
      );
    }
    return this.betterAuthVerifier;
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

  private extractCookieHeader(client: Socket): string | undefined {
    const cookie = client.handshake.headers.cookie;
    if (typeof cookie === 'string' && cookie.length > 0) {
      return cookie;
    }

    if (Array.isArray(cookie)) {
      const joinedCookie = cookie.filter(Boolean).join('; ');
      return joinedCookie || undefined;
    }

    return undefined;
  }

  private extractResponseToken(
    response: BetterAuthTokenResponse,
  ): string | null {
    if (typeof response.token === 'string' && response.token.length > 0) {
      return response.token;
    }

    const nestedToken = response.data?.token;
    return typeof nestedToken === 'string' && nestedToken.length > 0
      ? nestedToken
      : null;
  }

  /**
   * Returns the auth record for the socket if authenticated, or emits
   * `terminal:error` and disconnects if not.
   */
  private requireAuthenticated(client: Socket): SocketAuthRecord | null {
    const auth = this.authenticatedSockets.get(client.id);
    if (auth) {
      return auth;
    }

    client.emit('terminal:error', {
      message: 'Local terminal requires an authenticated session.',
    });
    client.disconnect(true);
    return null;
  }
}
