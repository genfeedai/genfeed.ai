import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DistributionsCoreModule } from '@api/collections/distributions/distributions-core.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { TelegramDistributionService } from '@api/services/distribution/telegram/telegram-distribution.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [TelegramDistributionService],
  imports: [
    ConfigModule,
    HttpModule,
    LoggerModule,
    CredentialsCoreModule,
    DistributionsCoreModule,
    WorkflowsModule,
  ],
  providers: [TelegramDistributionService],
})
export class TelegramDistributionModule {}
