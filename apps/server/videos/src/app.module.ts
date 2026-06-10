import { LoggerModule } from '@libs/logger/logger.module';
import { S3Module } from '@libs/s3/s3.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@videos/config/config.module';
import { ConfigService } from '@videos/config/config.service';
import { ComfyUIController } from '@videos/controllers/comfyui.controller';
import { GenerationController } from '@videos/controllers/generation.controller';
import { HealthController } from '@videos/controllers/health.controller';
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
    S3Module.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
  ],
  providers: [ComfyUIService, GenerationService, JobService, WorkflowService],
})
export class AppModule {}
