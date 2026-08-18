import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { io, type Socket } from 'socket.io-client';

export type SocketDisconnectRecovery = 'automatic' | 'manual' | 'none';

export interface SocketDisconnectDisposition {
  expected: boolean;
  recovery: SocketDisconnectRecovery;
}

export interface SocketIdentityClaims {
  organizationId?: string;
  userId?: string;
}

/**
 * Read `sub` / `organizationId` from a JWT payload without verifying it.
 *
 * Better Auth refresh re-issues a new signature for the same identity; logout
 * then login in the same JS heap can swap the subject while the socket stays
 * up. The client only uses these claims to decide whether rotation is same-user
 * or cross-identity. Cross-identity replacement disconnects so the next
 * handshake is verified as a new connection.
 */
export function readSocketIdentityFromToken(
  token?: string,
): SocketIdentityClaims {
  if (!token) {
    return {};
  }

  const segments = token.split('.');
  if (segments.length < 2) {
    return {};
  }

  const payload = decodeJwtPayloadSegment(segments[1]);
  if (!payload) {
    return {};
  }

  return {
    organizationId: readNonEmptyString(payload.organizationId),
    userId: readNonEmptyString(payload.sub),
  };
}

export function isCrossIdentitySocketRotation(
  previousToken?: string,
  nextToken?: string,
): boolean {
  const previous = readSocketIdentityFromToken(previousToken);
  const next = readSocketIdentityFromToken(nextToken);

  if (!previous.userId || !next.userId) {
    return false;
  }

  return (
    previous.userId !== next.userId ||
    previous.organizationId !== next.organizationId
  );
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function decodeJwtPayloadSegment(
  segment: string,
): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(segment));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function closeSocketEngine(socket: Socket): void {
  const manager: unknown = socket.io;
  if (!manager || typeof manager !== 'object' || !('engine' in manager)) {
    return;
  }

  const engine = manager.engine;
  if (!engine || typeof engine !== 'object' || !('close' in engine)) {
    return;
  }

  if (typeof engine.close !== 'function') {
    return;
  }

  engine.close();
}

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(padded);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  throw new Error('No base64 decoder available');
}

export function classifySocketDisconnect(
  reason: string,
  isAutomaticallyReconnecting: boolean,
): SocketDisconnectDisposition {
  // Deliberate client teardown (logout, clearInstance, route remount disconnect).
  if (reason === 'io client disconnect') {
    return { expected: true, recovery: 'none' };
  }

  // Transient transport loss: Socket.IO usually reconnects. Log as info while
  // active so Sentry is not flooded (APP-GENFEED-AI-8 / #2188). When the
  // manager is no longer active, surface as manual recovery for real outages.
  if (
    reason === 'transport close' ||
    reason === 'ping timeout' ||
    reason === 'transport error'
  ) {
    return {
      expected: false,
      recovery: isAutomaticallyReconnecting ? 'automatic' : 'manual',
    };
  }

  return {
    expected: false,
    recovery: isAutomaticallyReconnecting ? 'automatic' : 'manual',
  };
}

export class SocketService {
  private static classInstance?: SocketService;
  public socket!: Socket;
  private currentToken?: string;

  private constructor(token?: string) {
    this.currentToken = token;
    this.initializeSocket(token);
  }

  private initializeSocket(token?: string): void {
    const socketConfig = {
      timeout: 20_000,
      transports: ['websocket', 'polling'],
      upgrade: true,
      // Capped exponential backoff. Without these, socket.io-client falls back
      // to a 5s reconnect ceiling and retries forever, flooding the gateway on
      // every outage. Delay doubles from 1s up to a 30s cap (with jitter).
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      ...(token && {
        auth: { token },
        extraHeaders: { Authorization: `Bearer ${token}` },
      }),
    };

    logger.info('Socket initializing', {
      endpoint: EnvironmentService.wsEndpoint,
      hasToken: !!token,
    });

    this.socket = io(EnvironmentService.wsEndpoint, socketConfig);

    // Add connection event listeners for debugging
    this.socket.on('connect', () => {
      logger.info('Socket connected successfully', {
        socketId: this.socket.id,
      });
    });

    this.socket.on('connected', (data: unknown) => {
      logger.info('Socket received connected confirmation from server', data);
    });

    this.socket.on('connect_error', (error: Error) => {
      const recovery = this.socket.active ? 'automatic' : 'manual';
      const context = { errorName: error.name, recovery };

      if (recovery === 'automatic') {
        logger.info('Socket connection retry scheduled', context);
        return;
      }

      logger.warn('Socket connection rejected', {
        ...context,
        tags: { component: 'realtime', recovery },
      });
    });

    this.socket.on('disconnect', (reason: string) => {
      const disposition = classifySocketDisconnect(reason, this.socket.active);
      const context = {
        ...disposition,
        reason,
      };

      if (disposition.expected) {
        logger.info('Socket disconnected', context);
        return;
      }

      if (disposition.recovery === 'automatic') {
        logger.info('Socket connection interrupted', context);
        return;
      }

      logger.warn('Socket disconnected unexpectedly', {
        ...context,
        tags: {
          component: 'realtime',
          recovery: disposition.recovery,
        },
      });
    });
  }

  public static getInstance(token?: string): SocketService {
    if (!SocketService.classInstance) {
      SocketService.classInstance = new SocketService(token);
    } else if (token && SocketService.classInstance.currentToken !== token) {
      SocketService.classInstance.updateToken(token);
    }

    return SocketService.classInstance;
  }

  /**
   * Rotate the bearer token without tearing the socket down.
   *
   * Better Auth re-issues a short-lived JWT roughly every 30s, and the gateway
   * only reads the token during the handshake. Recreating the socket on every
   * rotation dropped a healthy connection (and every listener bound to it) into
   * a "reconnecting" state several times a minute. Updating `auth` and the
   * manager's `extraHeaders` in place means the next (re)connect uses the fresh
   * token while a live connection stays untouched.
   *
   * Cross-identity replacement (logout → login in the same JS heap) is the
   * exception: abort any live session or in-flight CONNECT, then handshake
   * the latest token. A second swap while reconnecting must not keep the
   * intermediate identity's handshake.
   */
  private updateToken(token: string): void {
    const shouldRebindIdentity = isCrossIdentitySocketRotation(
      this.currentToken,
      token,
    );

    this.currentToken = token;
    this.socket.auth = { token };

    const managerOptions = this.socket.io?.opts;
    if (managerOptions) {
      managerOptions.extraHeaders = {
        ...managerOptions.extraHeaders,
        Authorization: `Bearer ${token}`,
      };
    }

    if (shouldRebindIdentity) {
      this.restartIdentityHandshake();
      return;
    }

    // An idle socket (rejected handshake with a stale token, no automatic
    // retry pending) should pick the rotated token up right away.
    if (!this.socket.connected && !this.socket.active) {
      this.socket.connect();
    }
  }

  /**
   * Abort a live session or in-flight CONNECT, then handshake the latest
   * token. A second identity swap while `connected` is false and `active` is
   * true would otherwise keep the intermediate handshake.
   */
  private restartIdentityHandshake(): void {
    if (this.socket.connected || this.socket.active) {
      this.abortSocketTransport();
    }

    this.socket.connect();
  }

  private abortSocketTransport(): void {
    if (this.socket.connected) {
      this.socket.disconnect();
      return;
    }

    // Mid-handshake: `socket.disconnect()` does not close the engine when
    // CONNECT has not completed. Close the transport so the intermediate
    // token cannot finish the handshake.
    this.socket.disconnect();
    closeSocketEngine(this.socket);
  }

  public connect(): void {
    logger.info('Socket connected');
    this.socket.connect();
  }

  public disconnect(): void {
    logger.info('Socket disconnected');
    if (this.socket && typeof this.socket.disconnect === 'function') {
      this.socket.disconnect();
    }
  }

  public off(event: string, listener?: (...args: unknown[]) => void): void {
    if (this.socket && typeof this.socket.off === 'function') {
      this.socket.off(event, listener);
    }
  }

  public static clearInstance(): void {
    if (!SocketService.classInstance) {
      return;
    }

    SocketService.classInstance.disconnect();
    SocketService.classInstance.socket.removeAllListeners?.();
    SocketService.classInstance = undefined;
  }
}
