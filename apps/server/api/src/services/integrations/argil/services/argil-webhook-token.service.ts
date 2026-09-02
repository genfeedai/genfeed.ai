import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@libs/config/config.service';
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class ArgilWebhookTokenService {
  constructor(private readonly configService: ConfigService) {}

  create(videoId: string): string | undefined {
    const configuredSecret = this.configService.get('ARGIL_WEBHOOK_SECRET');
    if (typeof configuredSecret !== 'string' || configuredSecret.length === 0) {
      return undefined;
    }

    return createHmac('sha256', configuredSecret).update(videoId).digest('hex');
  }

  assert(videoId: string, suppliedToken?: string): void {
    const expectedToken = this.create(videoId);
    if (!expectedToken) {
      throw new ServiceUnavailableException(
        'Argil webhook verification is not configured',
      );
    }

    if (!suppliedToken) {
      throw new UnauthorizedException('Invalid Argil webhook token');
    }

    const supplied = Buffer.from(suppliedToken);
    const expected = Buffer.from(expectedToken);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      throw new UnauthorizedException('Invalid Argil webhook token');
    }
  }
}
