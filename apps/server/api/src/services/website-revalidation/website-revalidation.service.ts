import { WEBSITE_REVALIDATE_PATH } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const DEFAULT_WEBSITE_URL = 'https://genfeed.ai';
const REVALIDATE_TIMEOUT_MS = 5_000;
const TRAILING_SLASH_PATTERN = /\/$/;

/**
 * Asks genfeed.ai to drop its cached pages, so a removal shows at once
 * instead of after the pages' own revalidate window. Best effort: the
 * website's cache still expires on its own if this call fails, so a failure
 * is logged and never fails the operator's write. Deployments without
 * `WEBSITE_REVALIDATE_SECRET` (self-hosted) skip the call.
 */
@Traced()
@Injectable()
export class WebsiteRevalidationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  /** Returns whether the website confirmed the pages were cleared. */
  async revalidatePublicPages(): Promise<boolean> {
    const secret = this.configService.get('WEBSITE_REVALIDATE_SECRET');
    if (!secret) {
      return false;
    }

    try {
      const response = await fetch(this.revalidateUrl(), {
        headers: { Authorization: `Bearer ${secret}` },
        method: 'POST',
        signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.loggerService.warn('Website revalidation was refused', {
          status: response.status,
        });
        return false;
      }
      return true;
    } catch (error: unknown) {
      this.loggerService.error('Website revalidation failed', error);
      return false;
    }
  }

  private revalidateUrl(): string {
    const configured = this.configService.get('GENFEEDAI_PUBLIC_URL');
    const base =
      typeof configured === 'string' && configured.length > 0
        ? configured.replace(TRAILING_SLASH_PATTERN, '')
        : DEFAULT_WEBSITE_URL;
    return `${base}${WEBSITE_REVALIDATE_PATH}`;
  }
}
