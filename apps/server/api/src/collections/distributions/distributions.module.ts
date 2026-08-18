import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DistributionsController } from '@api/collections/distributions/controllers/distributions.controller';
import { DistributionsCoreModule } from '@api/collections/distributions/distributions-core.module';
import { TelegramDistributionModule } from '@api/services/distribution/telegram/telegram-distribution.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [DistributionsController],
  exports: [DistributionsCoreModule],
  imports: [
    DistributionsCoreModule,
    ConfigModule,
    LoggerModule,
    CredentialsCoreModule,
    TelegramDistributionModule,
  ],
})
export class DistributionsModule {}
