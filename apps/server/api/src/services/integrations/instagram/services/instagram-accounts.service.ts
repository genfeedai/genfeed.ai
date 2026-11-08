import { getSafeInstagramOAuthErrorLog } from '@api/services/integrations/instagram/utils/instagram-error.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { InstagramPageResponse } from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/** Defensive cap on account-list pagination batches — a portfolio sharing an
 * unreasonable number of Instagram accounts should not be able to make this
 * request loop indefinitely. */
const INSTAGRAM_ACCOUNT_LIST_MAX_PAGES = 25;

/** Owns reading which Instagram accounts a business token can act as. */
export class InstagramAccountsService {
  constructor(
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly graphUrl: string,
    private readonly apiVersion: string,
  ) {}

  /**
   * Every Instagram professional (Business or Creator) account the client's
   * Business Integration System User token was assigned, via
   * `me/assigned_instagram_accounts` — no Facebook Page is involved. Paginates
   * with the `after` cursor (never the raw `paging.next` URL, which embeds
   * `access_token` in a string that ends up in request logs and history) and
   * stops after `INSTAGRAM_ACCOUNT_LIST_MAX_PAGES` batches so a
   * pathologically large or looping result set cannot hang the request.
   * `InstagramService.listAuthorizedInstagramAccounts` reads this first and
   * falls back to the token's grant targets when it answers empty.
   *
   * The list edge documents only `id` and `username`; the display name and
   * avatar are read per account and are best-effort.
   */
  @Traced()
  public async listAuthorizedInstagramAccounts(
    accessToken: string,
  ): Promise<InstagramPageResponse[]> {
    const url = `InstagramAccountsService ${CallerUtil.getCallerName()}`;
    const accounts: InstagramPageResponse[] = [];
    let afterCursor: string | undefined;
    let pageCount = 0;

    try {
      for (;;) {
        pageCount += 1;
        if (pageCount > INSTAGRAM_ACCOUNT_LIST_MAX_PAGES) {
          this.loggerService.warn(`${url} stopped at the pagination cap`, {
            maxPages: INSTAGRAM_ACCOUNT_LIST_MAX_PAGES,
          });
          break;
        }

        const response = await firstValueFrom(
          this.httpService.get(
            `${this.graphUrl}/${this.apiVersion}/me/assigned_instagram_accounts`,
            {
              timeout: 10_000,
              params: {
                access_token: accessToken,
                ...(afterCursor ? { after: afterCursor } : {}),
                fields: 'id,username',
              },
            },
          ),
        );

        const assigned: Array<{ id?: string; username?: string }> =
          response.data?.data ?? [];

        // Profile reads are best-effort and independent: run them together so
        // the wait is one timeout per batch, not one per account.
        const batch = await Promise.all(
          assigned
            .filter((account) => Boolean(account?.id))
            .map((account) =>
              this.readInstagramAccountProfile(
                account.id as string,
                account.username,
                accessToken,
              ),
            ),
        );
        accounts.push(...batch);

        const hasNext = typeof response.data?.paging?.next === 'string';
        const nextAfter = response.data?.paging?.cursors?.after;
        if (!hasNext || typeof nextAfter !== 'string') {
          break;
        }
        afterCursor = nextAfter;
      }

      this.loggerService.log(`${url} succeeded`, {
        count: accounts.length,
        pageCount,
      });
      return accounts;
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeInstagramOAuthErrorLog(error),
      );
      throw error;
    }
  }

  /**
   * Profiles for Instagram account ids learned some other way than the
   * assigned-accounts edge (the token's `debug_token` grant targets). Each
   * read is best-effort and independent, like the batch in the list above.
   */
  @Traced()
  public async describeInstagramAccounts(
    accountIds: string[],
    accessToken: string,
  ): Promise<InstagramPageResponse[]> {
    return Promise.all(
      accountIds.map((accountId) =>
        this.readInstagramAccountProfile(accountId, undefined, accessToken),
      ),
    );
  }

  /** Display name and avatar for one account; a failed read leaves them out. */
  @Traced()
  private async readInstagramAccountProfile(
    accountId: string,
    username: string | undefined,
    accessToken: string,
  ): Promise<InstagramPageResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/${accountId}`,
          {
            timeout: 10_000,
            params: {
              access_token: accessToken,
              fields: 'username,name,profile_picture_url',
            },
          },
        ),
      );

      return {
        id: accountId,
        image: response.data?.profile_picture_url,
        label: response.data?.name,
        platform: CredentialPlatform.INSTAGRAM,
        username: response.data?.username ?? username,
      };
    } catch (error: unknown) {
      this.loggerService.warn(
        'InstagramAccountsService account profile unavailable',
        getSafeInstagramOAuthErrorLog(error),
      );
      return {
        id: accountId,
        platform: CredentialPlatform.INSTAGRAM,
        username,
      };
    }
  }
}
