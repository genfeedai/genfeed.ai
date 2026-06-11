import { BaseJobService } from '@libs/jobs/base-job.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, Optional } from '@nestjs/common';
import type { VideoGenerationJob } from '@videos/interfaces/videos.interfaces';

@Injectable()
export class JobService extends BaseJobService<VideoGenerationJob> {
  constructor(
    loggerService: LoggerService,
    @Optional() redisService?: RedisService,
  ) {
    super(loggerService, 'videos', redisService);
  }
}
