import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialSourceHistoryImportService } from '@api/collections/social-sources/services/social-source-history-import.service';
import { returnBadRequest } from '@api/helpers/utils/response/response.util';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { InstagramAuthorizedSignalsService } from '@api/services/integrations/instagram/services/instagram-authorized-signals.service';
import {
  getSafeInstagramOAuthErrorLog,
  parseInstagramGrantedScopes,
} from '@api/services/integrations/instagram/utils/instagram-error.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { InstagramPageResponse } from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
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

/** `GET /debug_token`: what Meta says about the exchanged token. */
interface InstagramDebugTokenResponse {
  data?: {
    expires_at?: number;
    is_valid?: boolean;
    scopes?: string[];
  };
}

/**
 * The permission without which an authorization can never publish, read
 * insights, or tell which account it refers to.
 */
const INSTAGRAM_BASIC_SCOPE = 'instagram_basic';

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

    // The token response documents no `scope`; ask Meta what it granted. When
    // Meta does not say, the grant stays "unknown" and each call is checked by
    // Meta itself rather than guessed here.
    markStage('permission_check');
    const scope =
      tokenRes.data.scope ??
      (await this.readGrantedScopes(access_token, appId, appSecret));
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
      await this.instagramService.listAuthorizedInstagramAccounts(access_token);

    if (accounts.length === 0) {
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

  /** Granted permissions as Meta reports them for this token, if it will say. */
  private async readGrantedScopes(
    accessToken: string,
    appId: string,
    appSecret: string,
  ): Promise<string | undefined> {
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
      const scopes = response.data?.data?.scopes;
      return Array.isArray(scopes) ? scopes.join(',') : undefined;
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
