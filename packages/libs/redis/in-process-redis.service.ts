// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { RedisService } from './redis.service';

/**
 * In-process stand-in for {@link RedisService} (#2382).
 *
 * Redis pub/sub exists to fan messages out *across processes*. The desktop app
 * runs exactly one process — API, workers and websocket gateway all share a
 * single Node runtime — so the same delivery guarantee is met by a local
 * handler table, with no broker and no network.
 *
 * It extends {@link RedisService} rather than reimplementing the interface so
 * every existing injection site keeps its type unchanged. Every method that
 * would touch ioredis is overridden; the inherited connection logic never runs.
 *
 * Deliberately **not** a Redis emulator: {@link getPublisher} returns `null`,
 * which is the contract callers already handle for a Redis-less deployment.
 * Anything needing raw Redis commands must degrade, not silently no-op.
 */
@Injectable()
export class InProcessRedisService extends RedisService {
  private readonly inProcessContext = { service: InProcessRedisService.name };
  private readonly localHandlers = new Map<
    string,
    ((message: unknown) => void)[]
  >();

  constructor(
    @Inject('ConfigService')
    configService: {
      get: (key: string) => string | undefined;
    },
    private readonly inProcessLogger: LoggerService,
  ) {
    super(configService, inProcessLogger);
  }

  /** No connection to establish — the transport is this process's memory. */
  override async onModuleInit(): Promise<void> {
    this.inProcessLogger.log(
      'Redis driver "in-process": pub/sub served from memory, no broker connection',
      this.inProcessContext,
    );
  }

  /** Nothing to disconnect. */
  override async onModuleDestroy(): Promise<void> {
    this.localHandlers.clear();
  }

  /**
   * Deliver synchronously to this process's subscribers.
   *
   * Handlers receive the parsed payload and `'message'` listeners receive the
   * raw JSON string, matching the Redis-backed shape exactly so no consumer can
   * tell the two drivers apart.
   */
  override async publish(channel: string, message: unknown): Promise<void> {
    const payload = JSON.stringify(message);
    this.emit('message', channel, payload);

    const handlers = this.localHandlers.get(channel) ?? [];
    for (const handler of handlers) {
      try {
        handler(JSON.parse(payload));
      } catch (error) {
        // One failing subscriber must not stop delivery to the others; the
        // Redis driver gets this for free by fanning out through the broker.
        this.inProcessLogger.error(
          `In-process subscriber for ${channel} threw`,
          error as Error,
          this.inProcessContext,
        );
      }
    }
  }

  override async subscribe(
    channel: string,
    handler?: (message: unknown) => void,
  ): Promise<void> {
    const handlers = this.localHandlers.get(channel) ?? [];
    if (handler) {
      handlers.push(handler);
    }
    this.localHandlers.set(channel, handlers);
  }

  override async unsubscribe(channel: string): Promise<void> {
    this.localHandlers.delete(channel);
  }

  /** No raw client exists in this driver — callers must take the null path. */
  override getPublisher(): Redis | null {
    return null;
  }
}
