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

interface InstagramEdgeRow {
  id: string;
  instagram_business_account?: unknown;
  username?: string;
}

function isEdgeRow(value: unknown): value is InstagramEdgeRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

/** The rows of a Graph list answer, ignoring anything that is not a row. */
function readEdgeRows(data: unknown): InstagramEdgeRow[] {
  const rows = (data as { data?: unknown } | undefined)?.data;
  return Array.isArray(rows) ? rows.filter(isEdgeRow) : [];
}

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

  /**
   * Last resort when neither the assigned-accounts edge nor the token grant
   * names an account although Meta's dialog showed the customer choosing some.
   * Which edge lists them for a Business Integration System User token is not
   * documented, so each candidate is tried in turn and its outcome logged as
   * counts and error codes only (no ids, names or tokens). An account counts
   * only when the token can read its profile: a business edge may list
   * accounts the customer never shared with this app, and those must not be
   * offered.
   */
  @Traced()
  public async discoverFromBusinessEdges(
    accessToken: string,
    businessId: string,
  ): Promise<InstagramPageResponse[]> {
    const url = `InstagramAccountsService ${CallerUtil.getCallerName()}`;
    const candidates: Array<{
      edge: string;
      fields: string;
      toIds: (data: unknown) => Array<{ id: string; username?: string }>;
    }> = [
      {
        edge: 'me/accounts',
        fields: 'id,instagram_business_account{id,username}',
        toIds: (data) =>
          readEdgeRows(data).flatMap((page) => {
            const linked = page.instagram_business_account;
            return isEdgeRow(linked) ? [linked] : [];
          }),
      },
      ...[
        'instagram_business_accounts',
        'owned_instagram_accounts',
        'instagram_accounts',
      ].map((edge) => ({
        edge: `{business}/${edge}`,
        fields: 'id,username',
        toIds: (data: unknown) => readEdgeRows(data),
      })),
    ];

    const found = new Map<string, InstagramPageResponse>();
    for (const candidate of candidates) {
      const path = candidate.edge.replace('{business}', businessId);
      try {
        const response = await firstValueFrom(
          this.httpService.get(`${this.graphUrl}/${this.apiVersion}/${path}`, {
            timeout: 10_000,
            params: { access_token: accessToken, fields: candidate.fields },
          }),
        );
        const listed = candidate.toIds(response.data);
        const readable: InstagramPageResponse[] = [];
        for (const row of listed) {
          const profile = await this.readAccessibleProfile(
            row.id,
            row.username,
            accessToken,
          );
          if (profile) {
            readable.push(profile);
          }
        }
        this.loggerService.log(`${url} business edge answered`, {
          apiVersion: this.apiVersion,
          edge: candidate.edge,
          listedCount: listed.length,
          readableCount: readable.length,
        });
        for (const account of readable) {
          found.set(account.id, account);
        }
      } catch (error: unknown) {
        this.loggerService.warn(`${url} business edge failed`, {
          apiVersion: this.apiVersion,
          edge: candidate.edge,
          ...getSafeInstagramOAuthErrorLog(error),
        });
      }
    }

    return [...found.values()];
  }

  /** A profile read that must succeed: undefined when the token cannot read it. */
  @Traced()
  private async readAccessibleProfile(
    accountId: string,
    username: string | undefined,
    accessToken: string,
  ): Promise<InstagramPageResponse | undefined> {
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
    } catch {
      return undefined;
    }
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
