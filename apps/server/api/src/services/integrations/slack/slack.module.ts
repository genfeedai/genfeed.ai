import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
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
    BrandsModule,
    ConfigModule,
    forwardRef(() => CredentialsModule),
    HttpModule,
    LoggerModule,
  ],
  providers: [SlackService],
})
export class SlackModule {}
