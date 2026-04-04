import { ConfigModule } from '@images/config/config.module';
import { ComfyUIController } from '@images/controllers/comfyui.controller';
import { DatasetController } from '@images/controllers/dataset.controller';
import { GenerationController } from '@images/controllers/generation.controller';
import { HealthController } from '@images/controllers/health.controller';
import { LoraController } from '@images/controllers/lora.controller';
import { TrainingController } from '@images/controllers/training.controller';
import { ComfyUIService } from '@images/services/comfyui.service';
import { DatasetService } from '@images/services/dataset.service';
import { GenerationService } from '@images/services/generation.service';
import { JobService } from '@images/services/job.service';
import { LoraService } from '@images/services/lora.service';
import { S3Service } from '@images/services/s3.service';
import { TrainingService } from '@images/services/training.service';
import { LoggerModule } from '@libs/logger/logger.module';
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
  imports: [ConfigModule, HttpModule, LoggerModule],
  providers: [
    ComfyUIService,
    DatasetService,
    GenerationService,
    JobService,
    LoraService,
    S3Service,
    TrainingService,
  ],
})
export class AppModule {}
