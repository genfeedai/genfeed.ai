import { ArgilWebhookController } from '@api/endpoints/webhooks/argil/webhooks.argil.controller';
import { ChromaticWebhookController } from '@api/endpoints/webhooks/chromatic/webhooks.chromatic.controller';
import { FleetWebhookController } from '@api/endpoints/webhooks/fleet/webhooks.fleet.controller';
import { GitHubWebhookController } from '@api/endpoints/webhooks/github/webhooks.github.controller';
import { HeygenWebhookController } from '@api/endpoints/webhooks/heygen/webhooks.heygen.controller';
import { KlingWebhookController } from '@api/endpoints/webhooks/klingai/webhooks.kling.controller';
import { LeonardoaiWebhookController } from '@api/endpoints/webhooks/leonardoai/webhooks.leonardoai.controller';
import { OpusProWebhookController } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.controller';
import { ReplicateWebhookController } from '@api/endpoints/webhooks/replicate/webhooks.replicate.controller';
import { VercelWebhookController } from '@api/endpoints/webhooks/vercel/webhooks.vercel.controller';
import { WebhooksCoreModule } from '@api/endpoints/webhooks/webhooks-core.module';
import { XActivityWebhookController } from '@api/endpoints/webhooks/x-activity/webhooks.x-activity.controller';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    ArgilWebhookController,
    ChromaticWebhookController,
    FleetWebhookController,
    GitHubWebhookController,
    HeygenWebhookController,
    KlingWebhookController,
    LeonardoaiWebhookController,
    OpusProWebhookController,
    ReplicateWebhookController,
    VercelWebhookController,
    XActivityWebhookController,
  ],
  exports: [WebhooksCoreModule],
  imports: [WebhooksCoreModule],
})
export class WebhooksModule {}
