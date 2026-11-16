import type { ProviderVerificationPage } from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import { parseInstagramMediaVerificationPage } from '@api/services/integrations/publishers/publisher-media-verification-pages.util';
import {
  PROVIDER_VERIFICATION_PAGE_SIZE,
  PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS,
} from '@api/services/integrations/publishers/publisher-verification.util';
import { traced } from '@libs/tracing/traced';
import type { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const INSTAGRAM_VERIFICATION_FIELDS =
  'id,caption,media_type,media_product_type,timestamp,permalink,shortcode,children{id}';

/**
 * Reads the account's media created since the attempt began. Uses the
 * `instagram_basic` access the account already granted for publishing.
 */
export const readInstagramVerificationPage = traced(
  'readInstagramVerificationPage',
  async (
    http: HttpService,
    endpoint: string,
    accountId: string,
    accessToken: string,
    attemptStartedAt: Date,
    cursor?: string,
  ): Promise<ProviderVerificationPage> => {
    const response = await firstValueFrom(
      http.get<unknown>(`${endpoint}/${encodeURIComponent(accountId)}/media`, {
        maxRedirects: 0,
        params: {
          access_token: accessToken,
          ...(cursor ? { after: cursor } : {}),
          fields: INSTAGRAM_VERIFICATION_FIELDS,
          limit: PROVIDER_VERIFICATION_PAGE_SIZE,
          since: Math.floor(attemptStartedAt.getTime() / 1000),
        },
        timeout: PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS,
      }),
    );
    return parseInstagramMediaVerificationPage(response.data);
  },
);
