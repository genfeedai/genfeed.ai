import { HealthController } from '@libs/health/health.controller';
import {
  HEALTH_CONTRIBUTOR,
  type HealthContributor,
} from '@libs/health/health-contributor.interface';
import { LoggerModule } from '@libs/logger/logger.module';
import { RedisModule } from '@libs/redis/redis.module';
import { S3Module } from '@libs/s3/s3.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@videos/config/config.module';
import { ConfigService } from '@videos/config/config.service';
import { ComfyUIController } from '@videos/controllers/comfyui.controller';
import { GenerationController } from '@videos/controllers/generation.controller';
import { ComfyUIService } from '@videos/services/comfyui.service';
import { GenerationService } from '@videos/services/generation.service';
import { JobService } from '@videos/services/job.service';
import { WorkflowService } from '@videos/services/workflow.service';

@Module({
  controllers: [HealthController, ComfyUIController, GenerationController],
  imports: [
    ConfigModule,
    HttpModule,
    LoggerModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
    S3Module.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
  ],
  providers: [
    ComfyUIService,
    GenerationService,
    JobService,
    WorkflowService,
    {
      inject: [JobService],
      provide: HEALTH_CONTRIBUTOR,
      useFactory: (jobService: JobService): HealthContributor => ({
        getHealthDetails: async () => ({ jobs: await jobService.getStats() }),
      }),
    },
  ],
})
export class AppModule {}
