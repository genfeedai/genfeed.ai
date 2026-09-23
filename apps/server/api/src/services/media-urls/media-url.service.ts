import { ConfigService } from '@libs/config/config.service';
import {
  buildMediaUrl,
  type MediaUrlOptions,
  signCdnUrl,
} from '@libs/media/media-url.util';
import { Injectable } from '@nestjs/common';

/**
 * API-side access to the shared media URL builders in `@libs/media`.
 *
 * Ingredient reads already carry a computed, signed `cdnUrl` from the Prisma
 * result extension. This service covers what that cannot: URLs for objects
 * that are not ingredient rows, and server-side fetches (evaluation, Whisper)
 * that resolve a URL from `metadata.result` or other non-key sources.
 */
@Injectable()
export class MediaUrlService {
  constructor(private readonly configService: ConfigService) {}

  /** Absolute URL for a raw object key, signed when configured. */
  buildUrl(objectKey: string, options: MediaUrlOptions = {}): string {
    return buildMediaUrl(objectKey, this.configService.mediaUrlConfig, options);
  }

  /**
   * Signs an absolute URL on this deployment's CDN. URLs on any other origin
   * are returned untouched.
   */
  buildUrlFromAbsolute(
    absoluteUrl: string,
    options: MediaUrlOptions = {},
  ): string {
    return signCdnUrl(absoluteUrl, this.configService.mediaUrlConfig, options);
  }
}
