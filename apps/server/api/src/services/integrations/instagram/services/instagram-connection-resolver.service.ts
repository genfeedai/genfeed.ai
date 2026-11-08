import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialSourceHistoryImportService } from '@api/collections/social-sources/services/social-source-history-import.service';
import { returnBadRequest } from '@api/helpers/utils/response/response.util';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { InstagramAuthorizedSignalsService } from '@api/services/integrations/instagram/services/instagram-authorized-signals.service';
import {
  getSafeInstagramOAuthErrorLog,
  parseInstagramGrantedScopes,
} from '@api/services/integrations/instagram/utils/instagram-error.util';
import {
  INSTAGRAM_BASIC_SCOPE,
  toInstagramTokenGrant,
} from '@api/services/integrations/instagram/utils/instagram-token-grant.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
  InstagramDebugTokenResponse,
  InstagramPageResponse,
  InstagramSelectionCredential,
  InstagramTokenGrant,
} from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import {
  META_GRAPH_API_VERSION,
  META_GRAPH_URL,
} from '@genfeedai/integrations';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

interface InstagramTokenExchangeResponse {
  access_token: string;
  expires_in?: number;
  scope?: string;
}

/** `GET /me` with a Business Integration System User token. */
interface InstagramBusinessIdentityResponse {
  client_business_id?: string;
}

/**
 * The Instagram API with Unified Login orchestration behind
 * `InstagramController.verify` and `.selectAccount`: exchanging the
 * authorization code for the client's Business Integration System User token,
 * resolving which authorized account the grant refers to, and the best-effort
 * post-connection work that follows. Split out of the controller (a
 * `Controller`/`Service` line-count ratchet) so the HTTP layer stays a thin
 * request/response shell around this orchestration.
 */
@Traced()
@Injectable()
export class InstagramConnectionResolverService {
  private readonly redirectUri: string;
  private readonly graphUrl: string = META_GRAPH_URL;
  private readonly apiVersion: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly instagramService: InstagramService,
    private readonly instagramAuthorizedSignalsService: InstagramAuthorizedSignalsService,
    private readonly historyImportService: SocialSourceHistoryImportService,
    private readonly loggerService: LoggerService,
  ) {
    this.redirectUri = this.configService.get('INSTAGRAM_REDIRECT_URI') ?? '';
    this.apiVersion =
      this.configService.get('INSTAGRAM_API_VERSION') || META_GRAPH_API_VERSION;
  }

  /**
   * Exchange the OAuth `code` for the client's Business Integration System
   * User access token, record the business portfolio it belongs to, and
   * discover the Instagram accounts it authorizes.
   *
   * That token is issued once for the portfolio and has no short-lived to
   * long-lived exchange: its lifetime is set by the dashboard configuration.
   *
   * Accounts are discovered BEFORE `verify` persists anything: a grant that
   * resolves to zero accounts must never leave a tokened, unidentified row
   * behind — there would be nothing left to reconnect or clean up toward,
   * only an account the operator has to notice and delete.
   *
   * `markStage` mirrors the caller's own failure-stage tracking so a token-
   * exchange failure logs exactly which sub-step it happened at.
   */
  async exchangeAndDiscoverAccounts(params: {
    appId: string;
    appSecret: string;
    code: string;
    markStage: (stage: string) => void;
  }): Promise<{
    accessToken: string;
    accounts: InstagramPageResponse[];
    businessId: string | undefined;
    expiresIn: number | undefined;
    scope: string | undefined;
  }> {
    const { appId, appSecret, code, markStage } = params;

    markStage('token_exchange');
    const tokenRes: AxiosResponse<InstagramTokenExchangeResponse> =
      await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
          {
            params: {
              client_id: appId,
              client_secret: appSecret,
              code,
              redirect_uri: this.redirectUri,
            },
          },
        ),
      );

    const { access_token, expires_in } = tokenRes.data || {};

    this.loggerService.log(
      'InstagramConnectionResolverService - Business token obtained',
      { expiresIn: expires_in, hasToken: !!access_token },
    );

    if (!access_token) {
      return returnBadRequest({
        detail: 'Missing access token from Meta',
        title: 'Invalid payload',
      });
    }

    markStage('business_identity');
    const identityRes: AxiosResponse<InstagramBusinessIdentityResponse> =
      await firstValueFrom(
        this.httpService.get(`${this.graphUrl}/${this.apiVersion}/me`, {
          params: { access_token, fields: 'client_business_id' },
          timeout: 10_000,
        }),
      );
    const businessId = identityRes.data?.client_business_id;
    if (!businessId) {
      // `externalBusinessId` is what marks a credential as Unified Login;
      // without it the row would silently be treated as a Page-linked one.
      throw new HttpException(
        {
          detail: 'Meta did not identify the connected business.',
          title: 'Instagram connection failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    // The token response documents no `scope`; ask Meta what it granted. When
    // Meta does not say, the grant stays "unknown" and each call is checked by
    // Meta itself rather than guessed here.
    markStage('permission_check');
    let grant: InstagramTokenGrant | undefined;
    let hasReadGrant = false;
    if (tokenRes.data.scope === undefined) {
      grant = await this.readTokenGrant(access_token, appId, appSecret);
      hasReadGrant = true;
    }
    const scope = tokenRes.data.scope ?? grant?.scopes?.join(',');
    if (
      scope !== undefined &&
      !parseInstagramGrantedScopes(scope).includes(INSTAGRAM_BASIC_SCOPE)
    ) {
      throw new HttpException(
        {
          detail:
            'Instagram needs permission to see your professional account. Please reconnect and approve that permission.',
          title: 'Missing permission',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    markStage('account_discovery');
    const accounts =
      await this.instagramService.listAuthorizedInstagramAccounts(
        access_token,
        grant?.instagramTargetIds,
      );

    if (accounts.length === 0) {
      if (!hasReadGrant) {
        grant = await this.readTokenGrant(access_token, appId, appSecret);
      }
      this.loggerService.warn(
        'InstagramConnectionResolverService - Meta authorized no Instagram account',
        {
          grantedScopeCount: grant?.scopes?.length ?? 0,
          hasBusinessId: Boolean(businessId),
          hasGrant: Boolean(grant),
          instagramTargetCount: grant?.instagramTargetIds.length ?? 0,
          scopedPermissions: grant?.scopedPermissions ?? [],
        },
      );
      throw new HttpException(
        {
          detail:
            'The Instagram account must be a professional account (Business or Creator). Please share an eligible account with Genfeed and try again.',
          title: 'Instagram account not eligible',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      accessToken: access_token,
      accounts,
      businessId,
      expiresIn: expires_in,
      scope,
    };
  }

  /** What Meta reports for this token, if it will say. */
  private async readTokenGrant(
    accessToken: string,
    appId: string,
    appSecret: string,
  ): Promise<InstagramTokenGrant | undefined> {
    try {
      const response: AxiosResponse<InstagramDebugTokenResponse> =
        await firstValueFrom(
          this.httpService.get(
            `${this.graphUrl}/${this.apiVersion}/debug_token`,
            {
              params: {
                access_token: `${appId}|${appSecret}`,
                input_token: accessToken,
              },
              timeout: 10_000,
            },
          ),
        );
      return toInstagramTokenGrant(response.data?.data);
    } catch (error: unknown) {
      this.loggerService.warn(
        'InstagramConnectionResolverService - Could not read granted scopes',
        getSafeInstagramOAuthErrorLog(error),
      );
      return undefined;
    }
  }

  /**
   * Resolve which Instagram professional account this OAuth grant authorized,
   * from a list already fetched by the caller (`verify` fetches it before
   * persisting anything). Unlike avatar/name enrichment this step is never
   * best-effort: an unresolved account is exactly the ambiguity this whole
   * flow exists to remove, so an open question returns `needsSelection`
   * rather than guessing.
   *
   * - A matching reconnect intent (see `InstagramController.connect`) wins
   *   outright. An intent that names an account NOT in this grant is left
   *   ambiguous rather than silently substituting a different account — even
   *   when exactly one candidate remains, that candidate is not the one the
   *   operator asked to reconnect.
   * - Otherwise, one eligible account is chosen automatically.
   * - Otherwise, accounts already held by another live credential of this
   *   brand are excluded; if exactly one remains, it is chosen.
   * - Anything still ambiguous is left unresolved for the operator to pick
   *   via `POST :credentialId/select-account`.
   */
  async resolveAuthorizedAccount(params: {
    accounts: InstagramPageResponse[];
    credential: Awaited<ReturnType<CredentialsService['patch']>>;
    organizationId: string;
    reconnectCredentialId: string | undefined;
    url: string;
  }): Promise<{
    credential: Awaited<ReturnType<CredentialsService['patch']>>;
    needsSelection: boolean;
  }> {
    const { accounts, credential, organizationId, reconnectCredentialId, url } =
      params;
    const brandId = credential.brandId ?? undefined;

    let chosen: InstagramPageResponse | undefined;
    let hadUnmatchedReconnectIntent = false;

    if (reconnectCredentialId && brandId) {
      const reconnectTarget = await this.credentialsService.resolveBrandAccount(
        {
          brandId,
          credentialId: reconnectCredentialId,
          isDisconnectedIncluded: true,
          organizationId,
          platform: CredentialPlatform.INSTAGRAM,
        },
      );

      if (reconnectTarget?.externalId) {
        chosen = accounts.find(
          (account) => account.id === reconnectTarget.externalId,
        );
        hadUnmatchedReconnectIntent = !chosen;
      } else {
        // The named credential is gone (deleted, or no longer this
        // brand/platform's) or was never identified. The connect attempt
        // still named a specific account to reconnect, so this is not "no
        // intent" — treat it the same as any other unmatched intent rather
        // than silently falling back to a different account.
        hadUnmatchedReconnectIntent = true;
      }
    }

    if (!chosen && !hadUnmatchedReconnectIntent) {
      if (accounts.length === 1) {
        chosen = accounts[0];
      } else if (accounts.length > 1 && brandId) {
        const heldAccounts =
          await this.credentialsService.findConnectedAccounts(
            organizationId,
            brandId,
            CredentialPlatform.INSTAGRAM,
          );
        const heldExternalIds = new Set(
          heldAccounts
            .filter((account) => account.id !== credential.id)
            .map((account) => account.externalId)
            .filter((externalId): externalId is string => Boolean(externalId)),
        );
        const remaining = accounts.filter(
          (account) => !heldExternalIds.has(account.id),
        );

        if (remaining.length === 1) {
          chosen = remaining[0];
        }
      }
    }

    if (!chosen) {
      this.loggerService.log(`${url} - Instagram account selection required`, {
        candidateCount: accounts.length,
        credentialId: credential.id,
        hadUnmatchedReconnectIntent,
      });
      return { credential, needsSelection: true };
    }

    const updated = await this.credentialsService.updateExternalProfile(
      credential.id.toString(),
      organizationId,
      {
        avatarUrl: chosen.image,
        // `username` is optional on InstagramPageResponse — Graph can omit
        // it on a reconnect. `undefined` means "leave the column as is";
        // an explicit `null` here would wipe an existing good handle, the
        // opposite of every other updateExternalProfile caller.
        handle: chosen.username ?? undefined,
        id: chosen.id,
        name: chosen.label || chosen.username,
      },
    );

    return { credential: updated, needsSelection: false };
  }

  /**
   * Settle a credential that verify left as `needsSelection` onto every
   * account the operator ticked, in the order given. The first account
   * settles this credential. Each further account becomes its own Instagram
   * credential on the same brand and shares this connection's token, so one
   * pass through Meta's dialog can connect several accounts. An account the
   * brand already holds is merged into that credential by
   * `CredentialsService.connectAccount`, exactly like a reconnect.
   *
   * The caller has already checked every account against the token's own
   * authorized list. A further account that fails to save is logged and
   * left out of the result instead of undoing the ones already connected;
   * its half-made row is retired so no token stays on an unidentified row.
   */
  async connectSelectedAccounts(params: {
    accessToken: string;
    accounts: InstagramPageResponse[];
    credential: InstagramSelectionCredential;
    organizationId: string;
    url: string;
  }): Promise<Awaited<ReturnType<CredentialsService['patch']>>[]> {
    const { accessToken, accounts, credential, organizationId, url } = params;
    const [first, ...others] = accounts;
    if (!first) {
      return [];
    }

    // Further accounts are created on the pending credential's brand for its
    // owner. Without either, refuse up front rather than connect the first
    // account and silently drop the rest.
    const brandId = credential.brandId;
    const userId = credential.userId;
    if (others.length > 0 && (!brandId || !userId)) {
      throw new HttpException(
        {
          detail:
            'This connection is missing its brand or owner, so it can connect only one account. Choose one account, or reconnect from the brand.',
          title: 'Choose one account',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const connected = [
      await this.connectSelectedAccount({
        accessToken,
        account: first,
        credentialId: credential.id,
        organizationId,
        url,
      }),
    ];

    if (!brandId || !userId) {
      return connected;
    }

    for (const account of others) {
      let siblingId: string | undefined;
      try {
        const sibling = await this.credentialsService.createPendingForBrand(
          { id: brandId, organizationId },
          userId,
          CredentialPlatform.INSTAGRAM,
          {
            accessToken,
            // The operator's history-import choice covers every account
            // this connect adds, not just the first.
            ...(typeof credential.isHistoryImportRequested === 'boolean'
              ? {
                  isHistoryImportRequested: credential.isHistoryImportRequested,
                }
              : {}),
          },
        );
        siblingId = sibling.id.toString();
        connected.push(
          await this.connectSelectedAccount({
            accessToken,
            account,
            connection: {
              accessTokenExpiry: credential.accessTokenExpiry ?? null,
              externalBusinessId: credential.externalBusinessId ?? null,
              grantedScopes: credential.grantedScopes ?? [],
              grantedScopesCapturedAt:
                credential.grantedScopesCapturedAt ?? null,
            },
            credentialId: siblingId,
            organizationId,
            url,
          }),
        );
      } catch (error: unknown) {
        this.loggerService.warn(
          `${url} could not connect an additional selected account`,
          getSafeInstagramOAuthErrorLog(error),
        );
        if (siblingId) {
          await this.retireSibling(siblingId, url);
        }
      }
    }

    // Two ticked accounts can never settle onto one row (each id is a
    // distinct identity), so the result has no duplicates to collapse.
    return connected;
  }

  /**
   * Take the token off a further account's row that never settled. A failed
   * cleanup is logged, not thrown, so it cannot undo the accounts already
   * connected; the stale-pending reaper retires the row later.
   */
  private async retireSibling(siblingId: string, url: string): Promise<void> {
    try {
      await this.credentialsService.patch(siblingId, {
        accessToken: null,
        isDeleted: true,
      });
    } catch (error: unknown) {
      this.loggerService.warn(
        `${url} could not retire an unsettled additional account`,
        getSafeInstagramOAuthErrorLog(error),
      );
    }
  }

  /** Write one chosen account's identity onto a credential, then finish it. */
  private async connectSelectedAccount(params: {
    accessToken: string;
    account: InstagramPageResponse;
    connection?: Record<string, unknown>;
    credentialId: string;
    organizationId: string;
    url: string;
  }): Promise<Awaited<ReturnType<CredentialsService['patch']>>> {
    const { accessToken, account, connection, credentialId, organizationId } =
      params;
    const settled = await this.credentialsService.connectAccount(
      credentialId,
      organizationId,
      {
        avatarUrl: account.image,
        // `username` is optional on InstagramPageResponse — Graph can omit
        // it. `undefined` means "leave the column as is"; an explicit `null`
        // would wipe an existing good handle on a reconnect.
        handle: account.username ?? undefined,
        id: account.id,
        name: account.label || account.username,
      },
      connection,
    );

    return this.finalizeConnection({
      accessToken,
      credential: settled,
      // Undefined so the signal refresh falls back to the credential's
      // already-persisted grantedScopes, like any post-connection refresh.
      grantedScopes: undefined,
      organizationId,
      url: params.url,
    });
  }

  /**
   * Post-connection work that must never fail the connection itself: refresh
   * the authorized signals snapshot, then queue the import of the account's
   * existing posts. Both are best-effort and logged on failure.
   */
  async finalizeConnection(params: {
    accessToken: string;
    credential: Awaited<ReturnType<CredentialsService['patch']>>;
    grantedScopes: string | undefined;
    organizationId: string;
    url: string;
  }): Promise<Awaited<ReturnType<CredentialsService['patch']>>> {
    const { accessToken, grantedScopes, organizationId, url } = params;
    let credential = params.credential;
    try {
      await this.instagramAuthorizedSignalsService.refresh({
        accessToken,
        credentialId: credential.id.toString(),
        force: true,
        grantedScopes,
        organizationId,
      });
      credential =
        (await this.credentialsService.findOne({
          id: credential.id.toString(),
          organizationId,
          platform: CredentialPlatform.INSTAGRAM,
        })) ?? credential;
    } catch (signalError: unknown) {
      this.loggerService.warn(
        `${url} authorized signal refresh failed after connection`,
        getSafeInstagramOAuthErrorLog(signalError),
      );
    }
    try {
      if (credential.brandId) {
        await this.instagramService.subscribeToMessageWebhooks(
          organizationId,
          credential.brandId,
          credential.id.toString(),
        );
      }
    } catch (subscribeError: unknown) {
      this.loggerService.warn(
        `${url} message webhook subscription failed after connection`,
        getSafeInstagramOAuthErrorLog(subscribeError),
      );
    }
    try {
      await this.historyImportService.scheduleForCredential({
        credentialId: credential.id.toString(),
        organizationId,
      });
    } catch (scheduleError: unknown) {
      this.loggerService.warn(
        `${url} history import scheduling failed after connection`,
        getSafeInstagramOAuthErrorLog(scheduleError),
      );
    }
    return credential;
  }
}
