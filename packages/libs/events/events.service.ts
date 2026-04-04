import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class EventsService implements OnModuleInit {
  private readonly context = { service: EventsService.name };

  constructor(
    private readonly logger: LoggerService,
    private readonly redisService: RedisService,
  ) {}

  onModuleInit(): void {
    this.logger.log('EventsService initialized', this.context);
  }

  async emitToApi(channel: string, data: unknown): Promise<void> {
    await this.redisService.publish(`api:${channel}`, data);
  }

  async emit(channel: string, data: unknown): Promise<void> {
    await this.redisService.publish(channel, data);
  }
}
