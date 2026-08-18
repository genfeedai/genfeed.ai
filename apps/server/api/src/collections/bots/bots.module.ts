/**
 * Bots Module
 * Automated bot configurations: chatbot setups, automated responses,
and social media automation rules.
 */

import { BOTS_LIVESTREAM_SERVICE } from '@api/collections/bots/bots.tokens';
import { BotsController } from '@api/collections/bots/controllers/bots.controller';
import { BotsService } from '@api/collections/bots/services/bots.service';
import { BotsLivestreamService } from '@api/collections/bots/services/bots-livestream.service';
import { BotsLivestreamDeliveryService } from '@api/collections/bots/services/bots-livestream-delivery.service';
import { BotsLivestreamRuntimeService } from '@api/collections/bots/services/bots-livestream-runtime.service';
import { BotsRestreamChatService } from '@api/collections/bots/services/bots-restream-chat.service';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BotsController],
  exports: [BotsService, BotsLivestreamService, BotsRestreamChatService],
  imports: [CredentialsCoreModule, ReplicateModule],
  providers: [
    BotsService,
    BotsLivestreamRuntimeService,
    BotsLivestreamDeliveryService,
    BotsLivestreamService,
    {
      provide: BOTS_LIVESTREAM_SERVICE,
      useExisting: BotsLivestreamService,
    },
    BotsRestreamChatService,
  ],
})
export class BotsModule {}
