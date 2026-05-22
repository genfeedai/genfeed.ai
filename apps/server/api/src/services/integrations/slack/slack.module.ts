import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { ConfigModule } from '@api/config/config.module';
import { SlackController } from '@api/services/integrations/slack/controllers/slack.controller';
import { SlackService } from '@api/services/integrations/slack/services/slack.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [SlackController],
  exports: [SlackService],
  imports: [
    forwardRef(() => BrandsModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => CredentialsCoreModule),
    forwardRef(() => HttpModule),
    forwardRef(() => LoggerModule),
  ],
  providers: [SlackService],
})
export class SlackModule {}
