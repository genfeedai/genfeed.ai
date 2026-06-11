import type { GenerationJob } from '@images/interfaces/images.interfaces';
import { BaseJobService } from '@libs/jobs/base-job.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class JobService extends BaseJobService<GenerationJob> {
  constructor(
    loggerService: LoggerService,
    @Optional() redisService?: RedisService,
  ) {
    super(loggerService, 'images', redisService);
  }
}
