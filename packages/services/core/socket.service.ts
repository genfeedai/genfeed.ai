import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { io, type Socket } from 'socket.io-client';

export type SocketDisconnectRecovery = 'automatic' | 'manual' | 'none';

export interface SocketDisconnectDisposition {
  expected: boolean;
  recovery: SocketDisconnectRecovery;
}

export function classifySocketDisconnect(
  reason: string,
  isAutomaticallyReconnecting: boolean,
): SocketDisconnectDisposition {
  if (reason === 'io client disconnect') {
    return { expected: true, recovery: 'none' };
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

  private updateToken(token: string): void {
    this.currentToken = token;
    this.disconnect();
    this.initializeSocket(token);
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
