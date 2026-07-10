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
import { ConfigModule } from '@voices/config/config.module';
import { ConfigService } from '@voices/config/config.service';
import { TTSController } from '@voices/controllers/tts.controller';
import { TtsHealthController } from '@voices/controllers/tts-health.controller';
import { VoiceCloneController } from '@voices/controllers/voice-clone.controller';
import { VoiceDatasetController } from '@voices/controllers/voice-dataset.controller';
import { VoiceTrainingController } from '@voices/controllers/voice-training.controller';
import { VoicesController } from '@voices/controllers/voices.controller';
import { JobService } from '@voices/services/job.service';
import { TTSService } from '@voices/services/tts.service';
import { TTSInferenceService } from '@voices/services/tts-inference.service';
import { VoiceCloneService } from '@voices/services/voice-clone.service';
import { VoiceDatasetService } from '@voices/services/voice-dataset.service';
import { VoiceProfilesService } from '@voices/services/voice-profiles.service';
import { VoiceTrainingService } from '@voices/services/voice-training.service';

@Module({
  controllers: [
    HealthController,
    TtsHealthController,
    TTSController,
    VoiceCloneController,
    VoiceDatasetController,
    VoiceTrainingController,
    VoicesController,
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
    JobService,
    TTSInferenceService,
    TTSService,
    VoiceCloneService,
    VoiceDatasetService,
    VoiceProfilesService,
    VoiceTrainingService,
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
