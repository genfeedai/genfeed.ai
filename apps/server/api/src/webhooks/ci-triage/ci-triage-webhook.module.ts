import { ConfigModule } from '@api/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';
import { CiTriageWebhookController } from './ci-triage-webhook.controller';
import { CiTriageWebhookService } from './ci-triage-webhook.service';

@Module({
  controllers: [CiTriageWebhookController],
  imports: [ConfigModule, LoggerModule],
  providers: [CiTriageWebhookService],
})
export class CiTriageWebhookModule {}
