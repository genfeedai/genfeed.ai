import type { Server as HttpServer } from 'node:http';
import type { LoggerService } from '@libs/logger/logger.service';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server, type ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private readonly constructorName: string = String(this.constructor.name);
  private adapterConstructor!: ReturnType<typeof createAdapter>;
  private appRef: INestApplicationContext | undefined;

  constructor(
    app: INestApplicationContext | undefined,
    private readonly redisUrl: string,
    private readonly loggerService: LoggerService,
    private readonly redisTls: boolean = false,
  ) {
    // Don't pass app to parent - we'll handle server creation ourselves
    super();
    this.appRef = app;
  }

  async connectToRedis(): Promise<void> {
    const tlsFromUrl = this.redisUrl.startsWith('rediss://');
    const useTls = this.redisTls || tlsFromUrl;

    const pubClient = createClient({
      socket: {
        ...(useTls && { tls: true }),
      },
      url: this.redisUrl,
    });
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
    const isDevelopment = process.env.NODE_ENV === 'development';
    const corsOrigin = isDevelopment
      ? [/^http:\/\/local\.genfeed\.ai:30(1[0-9]|20)$/]
      : [
          /^https:\/\/genfeed\.ai$/,
          /^https:\/\/(admin|analytics|automation|publisher|dashboard|docs|login|manager|storyboard|stock|studio)\.genfeed\.ai$/,
        ];

    const serverOptions: Partial<ServerOptions> = {
      cors: { credentials: true, origin: corsOrigin },
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
