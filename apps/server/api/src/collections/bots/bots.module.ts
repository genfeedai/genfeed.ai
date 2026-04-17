/**
 * Bots Module
 * Automated bot configurations: chatbot setups, automated responses,
and social media automation rules.
 */

import { BotsController } from '@api/collections/bots/controllers/bots.controller';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { BotsLivestreamDeliveryService } from '@api/collections/bots/services/bots-livestream-delivery.service';
import { BotsLivestreamRuntimeService } from '@api/collections/bots/services/bots-livestream-runtime.service';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BotsController],
  exports: [BotsService, BotsLivestreamService],
  imports: [CredentialsModule, ReplicateModule],
  providers: [
    BotsService,
    BotsLivestreamRuntimeService,
    BotsLivestreamDeliveryService,
    BotsLivestreamService,
  ],
})
export class BotsModule {}
