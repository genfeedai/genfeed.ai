import { ConfigModule } from '@images/config/config.module';
import { ConfigService } from '@images/config/config.service';
import { ComfyUIController } from '@images/controllers/comfyui.controller';
import { DatasetController } from '@images/controllers/dataset.controller';
import { GenerationController } from '@images/controllers/generation.controller';
import { HealthController } from '@images/controllers/health.controller';
import { LoraController } from '@images/controllers/lora.controller';
import { TrainingController } from '@images/controllers/training.controller';
import { GenerationRateLimitGuard } from '@images/guards/generation-rate-limit.guard';
import { InternalApiKeyGuard } from '@images/guards/internal-api-key.guard';
import { ComfyUIService } from '@images/services/comfyui.service';
import { DatasetService } from '@images/services/dataset.service';
import { GenerationService } from '@images/services/generation.service';
import { JobService } from '@images/services/job.service';
import { LoraService } from '@images/services/lora.service';
import { TrainingService } from '@images/services/training.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { RedisModule } from '@libs/redis/redis.module';
import { S3Module } from '@libs/s3/s3.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    HealthController,
    ComfyUIController,
    DatasetController,
    GenerationController,
    LoraController,
    TrainingController,
  ],
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
    DatasetService,
    GenerationService,
    GenerationRateLimitGuard,
    InternalApiKeyGuard,
    JobService,
    LoraService,
    TrainingService,
  ],
})
export class AppModule {}
