import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Builds the absolute URL for a stored media object from its object key.
 *
 * Media identity is the object key. URLs are derived per request so a
 * deployment can change CDN host, path scheme, or access policy without
 * rewriting stored rows, and so a URL can carry a short-lived signature —
 * which a persisted column could never do.
 *
 * Signing engages only when the deployment supplies both a key-pair id and a
 * private key. Self-hosted installations leave them unset and keep serving
 * media unsigned.
 */
@Injectable()
export class MediaUrlService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Absolute URL for `objectKey`, signed when this deployment is configured
   * for it. Pass `isSignable: false` for objects that are public by design
   * (published social media, share pages, OG images).
   */
  buildUrl(objectKey: string, options: { isSignable?: boolean } = {}): string {
    const normalizedKey = objectKey.trim().replace(/^\/+/, '');
    if (!normalizedKey) {
      throw new Error('objectKey is required to build a media URL');
    }

    const url = `${this.configService.cdnUrl}/${normalizedKey}`;
    const isSignable = options.isSignable ?? true;

    if (!isSignable || !this.configService.isCdnSigningEnabled) {
      return url;
    }

    return this.sign(url);
  }

  /**
   * Signs `url` with the configured CloudFront key pair.
   *
   * A signing failure never falls back to an unsigned URL — that would hand
   * out exactly the unauthorized access this prevents. It throws so the
   * caller can surface a retryable error instead.
   */
  private sign(url: string): string {
    const keyPairId = this.configService.cdnSigningKeyPairId;
    const privateKey = this.configService.cdnSigningPrivateKey;

    if (!keyPairId || !privateKey) {
      throw new Error('CDN signing is enabled but the key pair is incomplete');
    }

    const dateLessThan = new Date(
      Date.now() + this.configService.cdnSignedUrlTtlSeconds * 1000,
    ).toISOString();

    try {
      return getSignedUrl({ dateLessThan, keyPairId, privateKey, url });
    } catch (error) {
      this.loggerService.error(`${this.constructorName} sign failed`, {
        error,
        keyPairId,
      });
      throw new Error('Could not sign the media URL');
    }
  }
}
