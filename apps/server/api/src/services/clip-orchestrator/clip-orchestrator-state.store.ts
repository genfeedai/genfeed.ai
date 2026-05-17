import { RedisService } from '@libs/redis/redis.service';
import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class ClipOrchestratorStateStore {
  constructor(@Optional() private readonly redisService?: RedisService) {}

  async get<T>(
    namespace: string,
    id: string,
    revive?: (value: T) => T,
  ): Promise<T | undefined> {
    const redis = this.getRedisClient();
    const stored = await redis.get(this.getRedisKey(namespace, id));
    const value = stored ? (JSON.parse(stored) as T) : undefined;
    return value && revive ? revive(value) : value;
  }

  async set<T>(namespace: string, id: string, value: T): Promise<void> {
    await this.getRedisClient().set(
      this.getRedisKey(namespace, id),
      JSON.stringify(value),
    );
  }

  async delete(namespace: string, id: string): Promise<void> {
    await this.getRedisClient().del(this.getRedisKey(namespace, id));
  }

  private getRedisKey(namespace: string, id: string): string {
    return `clip-orchestrator:${namespace}:${id}`;
  }

  private getRedisClient() {
    const redis = this.redisService?.getPublisher();
    if (!redis) {
      throw new ServiceUnavailableException(
        'Clip orchestrator state requires Redis to be configured',
      );
    }
    return redis;
  }
}
