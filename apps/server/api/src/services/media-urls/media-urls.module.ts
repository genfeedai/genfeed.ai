import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { MediaDeliveryController } from '@api/services/media-urls/media-delivery.controller';
import { MediaDeliveryResponseInterceptor } from '@api/services/media-urls/media-delivery-response.interceptor';
import { MediaDerivativePreparationService } from '@api/services/media-urls/media-derivative-preparation.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { RateLimitGuard } from '@api/shared/guards/rate-limit/rate-limit.guard';
import { MEDIA_DELIVERY_QUEUE } from '@genfeedai/contracts/queue';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  controllers: [MediaDeliveryController],
  exports: [
    AuthorizedMediaUrlService,
    MediaDerivativePreparationService,
    MediaDeliveryResponseInterceptor,
    MediaUrlService,
  ],
  imports: [
    FilesClientModule,
    BullModule.registerQueue({ name: MEDIA_DELIVERY_QUEUE }),
  ],
  providers: [
    RateLimitGuard,
    AuthorizedMediaUrlService,
    MediaDerivativePreparationService,
    MediaDeliveryResponseInterceptor,
    MediaUrlService,
  ],
})
export class MediaUrlsModule {}
