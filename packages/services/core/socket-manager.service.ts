import type {
  IMediaEventData,
  IPromptEventData,
  ISocketError,
  ISocketErrorHandler,
  ISocketEventHandler,
  ISocketManagerConfig,
} from '@genfeedai/contracts/interfaces';
import type { SocketListener } from '@genfeedai/contracts/interfaces/services/socket-listener.interface';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import {
  classifySocketDisconnect,
  readSocketTokenExpiryMs,
  SocketService,
} from '@services/core/socket.service';

export type SocketConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

export class SocketManager {
  private static readonly TOKEN_REFRESH_FALLBACK_MS = 10 * 60 * 1_000;
  private static readonly TOKEN_REFRESH_RETRY_MS = 30_000;
  private static readonly TOKEN_REFRESH_SKEW_MS = 60_000;
  private static instance: SocketManager | null = null;
  private static instanceToken: string | undefined = undefined;
  private socketService: SocketService;
  private listeners: SocketListener[] = [];
  private errorHandler?: ISocketErrorHandler;
  private config: ISocketManagerConfig;
  private connectionState: SocketConnectionState = 'offline';
  private connectionStateListeners = new Set<
    (state: SocketConnectionState) => void
  >();
  private onConnectHandler?: () => void;
  private onConnectErrorHandler?: () => void;
  private onDisconnectHandler?: (reason: string) => void;
  private onReconnectAttemptHandler?: () => void;
  private manualReconnectAttempt = 0;
  private manualReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentToken?: string;
  private resolveToken?: () => Promise<string | null>;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: ISocketManagerConfig = {}) {
    this.socketService = SocketService.getInstance(config.token);
    this.config = {
      autoConnect: true,
      enableErrorHandling: true,
      errorMessage: 'Socket connection',
      ...config,
    };
    this.currentToken = config.token;
    this.resolveToken = config.resolveToken;

    if (this.config.autoConnect) {
      this.setConnectionState('connecting');
      this.socketService.connect();
    }

    this.setupConnectionStateHandlers();

    if (this.config.enableErrorHandling) {
      this.setupErrorHandler();
    }

    this.scheduleTokenRefresh();
  }

  public static getInstance(config: ISocketManagerConfig = {}): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager(config);
      SocketManager.instanceToken = config.token;
      return SocketManager.instance;
    }

    // A rotated token is handed to the shared socket in place. Recreating the
    // manager here used to drop every subscription and connection-state
    // listener each time the ~30s Better Auth JWT refreshed.
    if (config.token && SocketManager.instanceToken !== config.token) {
      SocketService.getInstance(config.token);
      SocketManager.instanceToken = config.token;
    }

    SocketManager.instance.configureTokenRefresh(config);

    return SocketManager.instance;
  }

  public static clearInstance(): void {
    if (SocketManager.instance) {
      SocketManager.instance.cleanup();
      SocketManager.instance = null;
      SocketManager.instanceToken = undefined;
      SocketService.clearInstance();
    }
  }

  private configureTokenRefresh(config: ISocketManagerConfig): void {
    if (config.resolveToken) {
      this.resolveToken = config.resolveToken;
    }
    if (config.token) {
      this.currentToken = config.token;
    }
    this.scheduleTokenRefresh();
  }

  private scheduleTokenRefresh(delayOverrideMs?: number): void {
    if (!this.resolveToken) {
      return;
    }
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }

    const expiresAt = readSocketTokenExpiryMs(this.currentToken);
    const delayMs =
      delayOverrideMs ??
      (expiresAt
        ? Math.max(
            5_000,
            expiresAt - Date.now() - SocketManager.TOKEN_REFRESH_SKEW_MS,
          )
        : SocketManager.TOKEN_REFRESH_FALLBACK_MS);

    this.tokenRefreshTimer = setTimeout(() => {
      this.tokenRefreshTimer = null;
      void this.refreshToken();
    }, delayMs);
  }

  private async refreshToken(): Promise<void> {
    if (!this.resolveToken) {
      return;
    }

    try {
      const token = await this.resolveToken();
      if (token) {
        SocketService.getInstance(token);
        SocketManager.instanceToken = token;
        this.currentToken = token;
      }
      this.scheduleTokenRefresh();
    } catch (error: unknown) {
      logger.warn('Socket token refresh failed; retry scheduled', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        tags: { component: 'realtime' },
      });
      this.scheduleTokenRefresh(SocketManager.TOKEN_REFRESH_RETRY_MS);
    }
  }

  private setupErrorHandler(): void {
    this.errorHandler = (err: ISocketError) => {
      logger.error(`Socket error: ${err.message}`);

      const notificationsService = NotificationsService.getInstance();
      notificationsService.error(
        this.config.errorMessage || 'Socket connection',
      );
    };

    this.socketService.socket.on('error', this.errorHandler);
  }

  private setupConnectionStateHandlers(): void {
    this.onConnectHandler = () => {
      this.manualReconnectAttempt = 0;
      this.clearManualReconnectTimer();
      this.setConnectionState('connected');
    };
    this.onConnectErrorHandler = () => {
      this.setConnectionState(
        this.socketService.socket.active ? 'reconnecting' : 'offline',
      );
    };
    this.onDisconnectHandler = (reason: string) => {
      const disposition = classifySocketDisconnect(
        reason,
        this.socketService.socket.active,
      );

      if (disposition.expected || disposition.recovery === 'none') {
        this.setConnectionState('offline');
        return;
      }

      this.setConnectionState('reconnecting');

      if (disposition.recovery === 'manual') {
        this.scheduleManualReconnect();
      }
    };
    this.onReconnectAttemptHandler = () => {
      this.setConnectionState('reconnecting');
    };

    this.socketService.socket.on('connect', this.onConnectHandler);
    this.socketService.socket.on('connect_error', this.onConnectErrorHandler);
    this.socketService.socket.on('disconnect', this.onDisconnectHandler);
    this.socketService.socket.io.on(
      'reconnect_attempt',
      this.onReconnectAttemptHandler,
    );
  }

  private setConnectionState(state: SocketConnectionState): void {
    this.connectionState = state;
    this.connectionStateListeners.forEach((listener) => {
      listener(state);
    });
  }

  private clearManualReconnectTimer(): void {
    if (!this.manualReconnectTimer) {
      return;
    }

    clearTimeout(this.manualReconnectTimer);
    this.manualReconnectTimer = null;
  }

  /**
   * `io server disconnect` disables Socket.IO auto-reconnect. Immediate
   * `connect()` turns an auth/JWKS failure into a tight loop. Back off the
   * same way the manager does for transport loss.
   */
  private scheduleManualReconnect(): void {
    if (this.manualReconnectTimer) {
      return;
    }

    const delayMs = Math.min(1_000 * 2 ** this.manualReconnectAttempt, 30_000);
    this.manualReconnectAttempt += 1;
    this.manualReconnectTimer = setTimeout(() => {
      this.manualReconnectTimer = null;
      this.socketService.connect();
    }, delayMs);
  }

  /**
   * Subscribe to a socket event with automatic cleanup tracking
   */
  public subscribe<T = unknown>(
    event: string,
    handler: ISocketEventHandler<T>,
  ): () => void {
    // Debug-level: this and the per-event log below sit on the streaming hot
    // path (every token chunk crosses here) and must not format payloads at
    // info level in production.
    logger.debug(`WSS subscribing to event: ${event}`, {
      isConnected: this.isConnected(),
      listenersCount: this.listeners.length,
      socketId: this.socketService.socket?.id,
    });

    // Wrap handler with logging
    const wrappedHandler: ISocketEventHandler<T> = (data: T) => {
      logger.debug(`WSS ${event}`, data);
      handler(data);
    };

    this.listeners.push({
      event,
      handler: wrappedHandler as ISocketEventHandler<unknown>,
      originalHandler: handler as ISocketEventHandler<unknown>,
    });
    this.socketService.socket.on(event, wrappedHandler);

    return () => this.unsubscribe(event, handler);
  }

  /**
   * Unsubscribe from a specific event
   */
  public unsubscribe<T = unknown>(
    event: string,
    handler?: ISocketEventHandler<T>,
  ): void {
    if (handler) {
      this.listeners = this.listeners.filter((listener) => {
        const isMatch =
          listener.event === event && listener.originalHandler === handler;

        if (isMatch) {
          this.socketService.off(event, listener.handler);
        }

        return !isMatch;
      });
    } else {
      // Remove all listeners for this event
      const eventListeners = this.listeners.filter(
        (listener) => listener.event === event,
      );
      eventListeners.forEach((listener) => {
        this.socketService.off(event, listener.handler);
      });
      this.listeners = this.listeners.filter(
        (listener) => listener.event !== event,
      );
    }
  }

  /**
   * Clean up all socket listeners
   */
  public cleanup(): void {
    this.clearManualReconnectTimer();
    this.manualReconnectAttempt = 0;
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
    this.resolveToken = undefined;

    // Remove all custom listeners
    this.listeners.forEach(({ event, handler }) => {
      this.socketService.off(event, handler);
    });
    this.listeners = [];

    // Remove error handler if it exists
    if (this.errorHandler) {
      this.socketService.off(
        'error',
        this.errorHandler as (...args: unknown[]) => void,
      );
      this.errorHandler = undefined;
    }

    if (this.onConnectHandler) {
      this.socketService.off('connect', this.onConnectHandler);
      this.onConnectHandler = undefined;
    }

    if (this.onConnectErrorHandler) {
      this.socketService.off('connect_error', this.onConnectErrorHandler);
      this.onConnectErrorHandler = undefined;
    }

    if (this.onDisconnectHandler) {
      this.socketService.off(
        'disconnect',
        this.onDisconnectHandler as (...args: unknown[]) => void,
      );
      this.onDisconnectHandler = undefined;
    }

    if (this.onReconnectAttemptHandler) {
      this.socketService.socket.io.off(
        'reconnect_attempt',
        this.onReconnectAttemptHandler,
      );
      this.onReconnectAttemptHandler = undefined;
    }
  }

  /**
   * Get the underlying socket service (for advanced use cases)
   */
  public getSocketService(): SocketService {
    return this.socketService;
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.socketService.socket?.connected || false;
  }

  /**
   * Manually connect if not already connected
   */
  public connect(): void {
    if (!this.isConnected()) {
      this.setConnectionState('connecting');
      this.socketService.connect();
    }
  }

  public getConnectionState(): SocketConnectionState {
    if (this.isConnected()) {
      return 'connected';
    }

    return this.connectionState;
  }

  public subscribeConnectionState(
    handler: (state: SocketConnectionState) => void,
  ): () => void {
    this.connectionStateListeners.add(handler);
    handler(this.getConnectionState());

    return () => {
      this.connectionStateListeners.delete(handler);
    };
  }

  /**
   * Get active listeners count
   */
  public getListenersCount(): number {
    return this.listeners.length;
  }
}

// Common socket event handlers
export function createPromptHandler<T = unknown>(
  onCompleted: (result: T) => void,
  onFailed?: (error: string) => void,
): ISocketEventHandler {
  return (data: unknown) => {
    const promptData = data as IPromptEventData;
    if (promptData.status === 'completed') {
      onCompleted(promptData.result as T);
    } else if (promptData.status === 'failed' && onFailed) {
      onFailed(promptData.error || 'Unknown error');
    }
  };
}

function resolveMediaFailureMessage(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return 'Unknown error';
  }

  const { error, message } = data as {
    error?: unknown;
    message?: unknown;
  };

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const nestedMessage = (error as { message?: unknown }).message;
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage;
    }
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  return 'Unknown error';
}

export function createMediaHandler<T = unknown>(
  onSuccess: (result: T) => void,
  onFailed?: (error: string) => void,
  onProgress?: (progress: {
    percent: number;
    eta?: number;
    stage?: string;
  }) => void,
): ISocketEventHandler {
  return (data: unknown) => {
    const mediaData = data as IMediaEventData;
    const notificationsService = NotificationsService.getInstance();

    logger.info('Media handler received data', {
      hasResult: !!mediaData.result,
      rawData: data,
      result: mediaData.result,
      status: mediaData.status,
    });

    switch (mediaData.status) {
      case 'success':
      case 'completed':
        logger.info('Calling onSuccess with result', {
          result: mediaData.result,
        });
        onSuccess(mediaData.result as T);
        break;

      case 'failed':
        {
          const errorMessage = resolveMediaFailureMessage(data);
          // Provider failures are a handled domain state. Logging them as a
          // console error makes the Next.js development overlay cover the
          // Studio retry UI even though onFailed already renders the failure.
          logger.warn('Media handler received failure', {
            error: errorMessage,
          });

          if (onFailed) {
            onFailed(errorMessage);
          } else {
            notificationsService.error(errorMessage);
          }
        }
        break;

      case 'processing':
        if (onProgress && mediaData.progress) {
          onProgress(mediaData.progress);
        }
        break;

      default:
        logger.error('Unknown media status', {
          data,
          status: mediaData.status,
        });
    }
  };
}
