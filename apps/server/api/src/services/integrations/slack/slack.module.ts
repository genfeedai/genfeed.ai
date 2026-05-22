import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { ConfigModule } from '@api/config/config.module';
import { SlackController } from '@api/services/integrations/slack/controllers/slack.controller';
import { SlackService } from '@api/services/integrations/slack/services/slack.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SlackController],
  exports: [SlackService],
  imports: [
    BrandsModule,
    ConfigModule,
    CredentialsCoreModule,
    HttpModule,
    LoggerModule,
  ],
  providers: [SlackService],
})
export class SlackModule {}
