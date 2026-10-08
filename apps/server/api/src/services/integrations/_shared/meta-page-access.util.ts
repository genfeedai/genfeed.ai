import type {
  FacebookPage,
  MetaPageAccess,
  MetaPageIdentity,
  MetaPageListResponse,
} from '@genfeedai/contracts/interfaces/integrations/facebook.interface';
import type { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const MAX_PAGE_BATCHES = 25;

/** Follow cursors against our configured origin; never follow a token-bearing next URL. */
export async function readMetaPages(
  http: HttpService,
  apiBaseUrl: string,
  userAccessToken: string,
): Promise<FacebookPage[]> {
  const pages: FacebookPage[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  for (let batch = 0; batch < MAX_PAGE_BATCHES; batch++) {
    const response = await firstValueFrom(
      http.get<MetaPageListResponse>(`${apiBaseUrl}/me/accounts`, {
        params: {
          access_token: userAccessToken,
          fields:
            'id,name,access_token,category,picture,instagram_business_account{id}',
          ...(after ? { after } : {}),
        },
        timeout: 10_000,
      }),
    );
    if (!Array.isArray(response.data?.data))
      throw new BadRequestException(
        'Meta returned an invalid Page list. Reconnect the account.',
      );
    pages.push(...response.data.data);
    if (!response.data.paging?.next) return pages;
    const cursor = response.data.paging.cursors?.after;
    if (!cursor || seen.has(cursor))
      throw new BadRequestException('Meta Page pagination did not advance.');
    seen.add(cursor);
    after = cursor;
  }
  throw new BadRequestException(
    'Meta Page pagination exceeded the safe limit.',
  );
}

export async function resolveMetaPageAccess(
  http: HttpService,
  apiBaseUrl: string,
  userAccessToken: string,
  identity: MetaPageIdentity,
): Promise<MetaPageAccess> {
  if (!identity.pageId && !identity.instagramAccountId)
    throw new BadRequestException(
      'The connected Meta account is missing its identity. Reconnect the account.',
    );
  const pages = await readMetaPages(http, apiBaseUrl, userAccessToken);
  const page = pages.find((candidate) =>
    identity.pageId
      ? candidate.id === identity.pageId
      : candidate.instagram_business_account?.id ===
        identity.instagramAccountId,
  );
  if (!page?.id || !page.access_token)
    throw new BadRequestException(
      'The selected account has no authorized Facebook Page token. Reconnect it and grant pages_show_list and the required messaging or Page permissions.',
    );
  return { pageId: page.id, accessToken: page.access_token };
}

/** An unknown historical grant is checked by Meta; a captured missing grant needs reconnect. */
export function requireMetaScopes(
  grantedScopes: readonly string[] | undefined,
  requiredScopes: readonly string[],
): void {
  if (grantedScopes === undefined) return;
  const missing = requiredScopes.filter(
    (scope) => !grantedScopes.includes(scope),
  );
  if (missing.length)
    throw new BadRequestException(
      `Reconnect the Meta account and grant ${missing.join(', ')}.`,
    );
}
