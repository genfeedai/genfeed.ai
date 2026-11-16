import type { ProviderVerificationPage } from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import { parseFacebookFeedVerificationPage } from '@api/services/integrations/publishers/publisher-media-verification-pages.util';
import {
  PROVIDER_VERIFICATION_PAGE_SIZE,
  PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS,
} from '@api/services/integrations/publishers/publisher-verification.util';
import { traced } from '@libs/tracing/traced';
import type { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const FACEBOOK_VERIFICATION_FIELDS =
  'id,created_time,message,is_published,permalink_url,attachments{media_type,target{id}}';

/**
 * Reads the Page's feed since the attempt began, with the Page access token the
 * publish used. `pages_read_engagement` is already part of the connect scopes.
 */
export const readFacebookVerificationPage = traced(
  'readFacebookVerificationPage',
  async (
    http: HttpService,
    endpoint: string,
    pageId: string,
    pageAccessToken: string,
    attemptStartedAt: Date,
    cursor?: string,
  ): Promise<ProviderVerificationPage> => {
    const response = await firstValueFrom(
      http.get<unknown>(`${endpoint}/${encodeURIComponent(pageId)}/feed`, {
        maxRedirects: 0,
        params: {
          access_token: pageAccessToken,
          ...(cursor ? { after: cursor } : {}),
          fields: FACEBOOK_VERIFICATION_FIELDS,
          limit: PROVIDER_VERIFICATION_PAGE_SIZE,
          since: Math.floor(attemptStartedAt.getTime() / 1000),
        },
        timeout: PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS,
      }),
    );
    return parseFacebookFeedVerificationPage(response.data);
  },
);
