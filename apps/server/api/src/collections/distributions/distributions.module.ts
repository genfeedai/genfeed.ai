import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { DistributionsController } from '@api/collections/distributions/controllers/distributions.controller';
import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import { TelegramDistributionModule } from '@api/services/distribution/telegram/telegram-distribution.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [DistributionsController],
  exports: [DistributionsService],
  imports: [
    forwardRef(() => ConfigModule),
    forwardRef(() => LoggerModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => TelegramDistributionModule),
  ],
  providers: [DistributionsService],
})
export class DistributionsModule {}
