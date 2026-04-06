import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@voices/config/config.module';
import { HealthController } from '@voices/controllers/health.controller';
import { TTSController } from '@voices/controllers/tts.controller';
import { VoiceCloneController } from '@voices/controllers/voice-clone.controller';
import { VoiceDatasetController } from '@voices/controllers/voice-dataset.controller';
import { VoiceTrainingController } from '@voices/controllers/voice-training.controller';
import { VoicesController } from '@voices/controllers/voices.controller';
import { JobService } from '@voices/services/job.service';
import { S3Service } from '@voices/services/s3.service';
import { TTSService } from '@voices/services/tts.service';
import { TTSInferenceService } from '@voices/services/tts-inference.service';
import { VoiceCloneService } from '@voices/services/voice-clone.service';
import { VoiceDatasetService } from '@voices/services/voice-dataset.service';
import { VoiceProfilesService } from '@voices/services/voice-profiles.service';
import { VoiceTrainingService } from '@voices/services/voice-training.service';

@Module({
  controllers: [
    HealthController,
    TTSController,
    VoiceCloneController,
    VoiceDatasetController,
    VoiceTrainingController,
    VoicesController,
  ],
  imports: [ConfigModule, HttpModule, LoggerModule],
  providers: [
    JobService,
    S3Service,
    TTSInferenceService,
    TTSService,
    VoiceCloneService,
    VoiceDatasetService,
    VoiceProfilesService,
    VoiceTrainingService,
  ],
})
export class AppModule {}
