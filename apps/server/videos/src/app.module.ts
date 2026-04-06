import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@videos/config/config.module';
import { ComfyUIController } from '@videos/controllers/comfyui.controller';
import { GenerationController } from '@videos/controllers/generation.controller';
import { HealthController } from '@videos/controllers/health.controller';
import { ComfyUIService } from '@videos/services/comfyui.service';
import { GenerationService } from '@videos/services/generation.service';
import { JobService } from '@videos/services/job.service';
import { S3Service } from '@videos/services/s3.service';
import { WorkflowService } from '@videos/services/workflow.service';

@Module({
  controllers: [HealthController, ComfyUIController, GenerationController],
  imports: [ConfigModule, HttpModule, LoggerModule],
  providers: [
    ComfyUIService,
    GenerationService,
    JobService,
    S3Service,
    WorkflowService,
  ],
})
export class AppModule {}
