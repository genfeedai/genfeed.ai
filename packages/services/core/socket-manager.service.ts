import type {
  IMediaEventData,
  IOrganizationEventData,
  IPromptEventData,
  ISocketError,
  ISocketErrorHandler,
  ISocketEventHandler,
  ISocketManagerConfig,
  IStepsEventData,
} from '@genfeedai/interfaces';
import type { SocketListener } from '@genfeedai/interfaces/services/socket-listener.interface';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SocketService } from '@services/core/socket.service';

export type SocketConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

export class SocketManager {
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
  private onDisconnectHandler?: () => void;
  private onReconnectAttemptHandler?: () => void;

  constructor(config: ISocketManagerConfig = {}) {
    this.socketService = SocketService.getInstance(config.token);
    this.config = {
      autoConnect: true,
      enableErrorHandling: true,
      errorMessage: 'Socket connection',
      ...config,
    };

    if (this.config.autoConnect) {
      this.setConnectionState('connecting');
      this.socketService.connect();
    }

    this.setupConnectionStateHandlers();

    if (this.config.enableErrorHandling) {
      this.setupErrorHandler();
    }
  }

  public static getInstance(config: ISocketManagerConfig = {}): SocketManager {
    // If token changes, recreate the instance
    if (
      !SocketManager.instance ||
      (config.token && SocketManager.instanceToken !== config.token)
    ) {
      // Clean up old instance if it exists
      if (SocketManager.instance) {
        SocketManager.instance.cleanup();
      }
      SocketManager.instance = new SocketManager(config);
      SocketManager.instanceToken = config.token;
    }
    return SocketManager.instance;
  }

  public static clearInstance(): void {
    if (SocketManager.instance) {
      SocketManager.instance.cleanup();
      SocketManager.instance = null;
      SocketManager.instanceToken = undefined;
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
      this.setConnectionState('connected');
    };
    this.onConnectErrorHandler = () => {
      this.setConnectionState('reconnecting');
    };
    this.onDisconnectHandler = () => {
      this.setConnectionState('offline');
    };
    this.onReconnectAttemptHandler = () => {
      this.setConnectionState('reconnecting');
    };

    this.socketService.socket.on('connect', this.onConnectHandler);
    this.socketService.socket.on('connect_error', this.onConnectErrorHandler);
    this.socketService.socket.on('disconnect', this.onDisconnectHandler);
    this.socketService.socket.on(
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

  /**
   * Subscribe to a socket event with automatic cleanup tracking
   */
  public subscribe<T = unknown>(
    event: string,
    handler: ISocketEventHandler<T>,
  ): () => void {
    // Log subscription details for debugging
    logger.info(`WSS subscribing to event: ${event}`, {
      isConnected: this.isConnected(),
      listenersCount: this.listeners.length,
      socketId: this.socketService.socket?.id,
    });

    // Wrap handler with logging
    const wrappedHandler: ISocketEventHandler<T> = (data: T) => {
      logger.info(`WSS ${event}`, data);
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
   * Subscribe to multiple socket events at once
   */
  public subscribeMultiple<T = unknown>(
    subscriptions: Array<{ event: string; handler: ISocketEventHandler<T> }>,
  ): Array<() => void> {
    return subscriptions.map(({ event, handler }) =>
      this.subscribe(event, handler),
    );
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
      this.socketService.off('disconnect', this.onDisconnectHandler);
      this.onDisconnectHandler = undefined;
    }

    if (this.onReconnectAttemptHandler) {
      this.socketService.off(
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
        logger.error('Media handler received failure', {
          error: mediaData.error,
        });

        if (onFailed) {
          onFailed(mediaData.error || 'Unknown error');
        } else {
          // Display the actual error message to the user
          const errorMessage = mediaData.error || 'Generation failed';
          notificationsService.error(errorMessage);
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

export function createOrganizationHandler<T = unknown>(
  onUpdate: (data: T) => void,
): ISocketEventHandler {
  return (data: unknown) => {
    const orgData = data as IOrganizationEventData;
    onUpdate(orgData as T);
  };
}

export function createStepsHandler<T = unknown>(
  onStepUpdate: (step: T) => void,
): ISocketEventHandler {
  return (data: unknown) => {
    const stepData = data as IStepsEventData;
    onStepUpdate(stepData as T);
  };
}
