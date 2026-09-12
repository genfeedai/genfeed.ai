import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SocialSourceHistoryImportService } from '@api/collections/social-sources/services/social-source-history-import.service';
import { returnBadRequest } from '@api/helpers/utils/response/response.util';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { InstagramAuthorizedSignalsService } from '@api/services/integrations/instagram/services/instagram-authorized-signals.service';
import {
  getSafeInstagramOAuthErrorLog,
  parseInstagramGrantedScopes,
} from '@api/services/integrations/instagram/utils/instagram-error.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/contracts';
import type { InstagramPageResponse } from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';

interface InstagramShortLivedTokenResponse {
  access_token: string;
  expires_in?: number;
  scope?: string;
}

interface InstagramLongLivedTokenResponse {
  access_token: string;
  expires_in?: number;
  scope?: string;
}

/** Required to list the Facebook Pages (and their linked IG accounts) an authorization can see. */
const INSTAGRAM_PAGES_SCOPE = 'pages_show_list';

/**
 * The Facebook/Instagram OAuth orchestration behind `InstagramController.verify`
 * and `.selectAccount`: exchanging the authorization code for a long-lived
 * token, resolving which authorized account the grant refers to, and the
 * best-effort post-connection work that follows. Split out of the controller
 * (a `Controller`/`Service` line-count ratchet) so the HTTP layer stays a thin
 * request/response shell around this orchestration.
 */
@Injectable()
export class InstagramConnectionResolverService {
  private readonly redirectUri: string;
  private readonly graphUrl: string = 'https://graph.facebook.com';
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
      this.configService.get('INSTAGRAM_API_VERSION') || 'v24.0';
  }

  /**
   * Exchange the OAuth `code` for a long-lived Facebook access token and
   * discover the Instagram accounts it authorizes, confirming the grant can
   * list Facebook Pages along the way.
   *
   * Accounts are discovered BEFORE `verify` persists anything: a grant that
   * resolves to zero accounts must never leave a tokened, unidentified row
   * behind — there would be nothing left to reconnect or clean up toward,
   * only an account the operator has to notice and delete.
   *
   * `markStage` mirrors the caller's own failure-stage tracking so a token-
   * exchange failure logs exactly which sub-step it happened at, the same
   * granularity `verify` recorded before this call was extracted.
   */
  async exchangeAndDiscoverAccounts(params: {
    appId: string;
    appSecret: string;
    code: string;
    markStage: (stage: string) => void;
  }): Promise<{
    accessToken: string;
    accounts: InstagramPageResponse[];
    expiresIn: number | undefined;
    scope: string | undefined;
  }> {
    const { appId, appSecret, code, markStage } = params;

    markStage('short_lived_token');
    const tokenRes: AxiosResponse<InstagramShortLivedTokenResponse> =
      await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
          null,
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

    const shortLivedToken = tokenRes.data.access_token;

    this.loggerService.log(
      'InstagramConnectionResolverService - Short-lived token obtained',
      {
        expiresIn: tokenRes.data.expires_in,
        hasToken: !!shortLivedToken,
      },
    );

    if (!shortLivedToken) {
      return returnBadRequest({
        detail: 'Missing short-lived access token from Facebook',
        title: 'Invalid payload',
      });
    }

    markStage('long_lived_token');
    const longTokenRes: AxiosResponse<InstagramLongLivedTokenResponse> =
      await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
          {
            params: {
              client_id: appId,
              client_secret: appSecret,
              fb_exchange_token: shortLivedToken,
              grant_type: OAuthGrantType.FB_EXCHANGE_TOKEN,
            },
          },
        ),
      );

    const { access_token, expires_in } = longTokenRes.data || {};
    const scope = tokenRes.data.scope ?? longTokenRes.data?.scope;

    if (!access_token) {
      return returnBadRequest({
        detail: 'Failed to get long-lived access token',
        title: 'Invalid payload',
      });
    }

    // A grant without permission to list Facebook Pages can never resolve an
    // account — surface that specifically, rather than the generic "not
    // eligible" error the empty-list case below throws.
    markStage('permission_check');
    const grantedScopesList = parseInstagramGrantedScopes(scope);
    if (!grantedScopesList.includes(INSTAGRAM_PAGES_SCOPE)) {
      throw new HttpException(
        {
          detail:
            'Instagram needs permission to see the Facebook Pages you manage. Please reconnect and approve that permission.',
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
            'The Instagram account must be a professional account (Business or Creator) linked to a Facebook Page you manage. Please connect an eligible account and try again.',
          title: 'Instagram account not eligible',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      accessToken: access_token,
      accounts,
      expiresIn: expires_in,
      scope,
    };
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
