import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DistributionsCoreModule } from '@api/collections/distributions/distributions-core.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { TelegramDistributionService } from '@api/services/distribution/telegram/telegram-distribution.service';
import { TelegramBotApiModule } from '@api/services/integrations/telegram/telegram-bot-api.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [TelegramDistributionService],
  imports: [
    ConfigModule,
    TelegramBotApiModule,
    LoggerModule,
    CredentialsCoreModule,
    DistributionsCoreModule,
    WorkflowsModule,
  ],
  providers: [TelegramDistributionService],
})
export class TelegramDistributionModule {}
