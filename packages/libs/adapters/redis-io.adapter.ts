import type { Server as HttpServer } from 'node:http';
import { getGenfeedCorsOrigins } from '@libs/config/cors.config';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  buildIoRedisClientOptions,
  parseRedisConnectionForWorkload,
  RedisWorkload,
} from '@libs/redis/redis-connection.utils';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, type ServerOptions } from 'socket.io';

/** Minimal config accessor — satisfied by ConfigService and plain shims alike. */
type RedisConfigAccessor = {
  get: (key: string) => string | boolean | number | undefined;
};

export class RedisIoAdapter extends IoAdapter {
  private readonly constructorName: string = String(this.constructor.name);
  private adapterConstructor!: ReturnType<typeof createAdapter>;
  private appRef: INestApplicationContext | undefined;

  /**
   * @param configAccessor A `{ get }` accessor (e.g. the service ConfigService)
   *   used to resolve the SOCKET workload connection. Reading through the config
   *   accessor — rather than pre-extracted discrete values — lets the socket.io
   *   fan-out honor its `REDIS_SOCKET_URL` / `REDIS_SOCKET_DB` isolation overrides
   *   (#1186) so it can be pointed at a dedicated instance/DB independent of the
   *   queue, cache, and rate-limit workloads.
   */
  constructor(
    app: INestApplicationContext | undefined,
    private readonly configAccessor: RedisConfigAccessor,
    private readonly loggerService: LoggerService,
  ) {
    // Don't pass app to parent - we'll handle server creation ourselves
    super();
    this.appRef = app;
  }

  async connectToRedis(): Promise<void> {
    const config = parseRedisConnectionForWorkload(
      this.configAccessor,
      RedisWorkload.SOCKET,
    );

    const pubClient = new Redis(buildIoRedisClientOptions(config));
    const subClient = pubClient.duplicate();

    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.loggerService.log('Redis adapter connected', {
        service: this.constructorName,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} connectToRedis failed`,
        error,
      );
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    // Reuse the shared CORS allowlist (@libs/config/cors.config) that the HTTP
    // layer already uses. The socket adapter previously carried its own
    // hardcoded origin list which had drifted from the canonical
    // GENFEED_SUBDOMAINS — notably omitting `app`, so WebSocket handshakes from
    // https://app.genfeed.ai were CORS-rejected (repeated "Socket disconnected"
    // on the production app) even though its REST calls were allowed. Sharing
    // one source of truth keeps the two layers from diverging again.
    const chromeExtensionId = this.configAccessor.get('CHROME_EXTENSION_ID');
    const serverOptions: Partial<ServerOptions> = {
      cors: {
        credentials: true,
        origin: getGenfeedCorsOrigins({
          chromeExtensionId:
            typeof chromeExtensionId === 'string' &&
            chromeExtensionId.length > 0
              ? chromeExtensionId
              : undefined,
          isDevelopment: process.env.NODE_ENV === 'development',
        }),
      },
      ...options,
    };

    let server: Server;

    // Get HTTP server from app if available and port is 0 (attach mode)
    if (port === 0 && this.appRef) {
      const httpServer = (
        this.appRef as INestApplicationContext & {
          getHttpServer?: () => HttpServer;
        }
      ).getHttpServer?.();
      if (httpServer && typeof httpServer.listeners === 'function') {
        server = new Server(httpServer, serverOptions);
      } else {
        // Fallback to standalone server on default port
        this.loggerService.warn(
          `${this.constructorName} HTTP server not ready, creating standalone socket.io server`,
        );
        server = new Server(3004, serverOptions);
      }
    } else {
      server = new Server(port || 3004, serverOptions);
    }

    try {
      if (this.adapterConstructor) {
        server.adapter(this.adapterConstructor);
      }
      this.loggerService.log(`Socket.IO server created`, {
        port: port || 3004,
        service: this.constructorName,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} createIOServer failed`,
        error,
      );
    }

    return server;
  }
}
