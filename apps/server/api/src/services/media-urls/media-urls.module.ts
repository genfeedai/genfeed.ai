import { MediaUrlSigningInterceptor } from '@api/helpers/interceptors/media-url-signing/media-url-signing.interceptor';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [MediaUrlService, MediaUrlSigningInterceptor],
  providers: [MediaUrlService, MediaUrlSigningInterceptor],
})
export class MediaUrlsModule {}
