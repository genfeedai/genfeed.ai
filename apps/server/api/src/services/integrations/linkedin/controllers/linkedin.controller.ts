import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { throwIfOAuthCallbackError } from '@api/collections/credentials/utils/oauth-callback-error.util';
import { SocialSourceHistoryImportService } from '@api/collections/social-sources/services/social-source-history-import.service';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { API_KEY_CONNECTED_ACCOUNT_READ_SCOPES } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import {
  returnBadRequest,
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { LinkedInAuthorizedSignalsService } from '@api/services/integrations/linkedin/services/linkedin-authorized-signals.service';
import { isLinkedinAuthorizationError } from '@api/services/integrations/linkedin/utils/linkedin-error.util';
import {
  getSafeLinkedInOAuthErrorLog,
  throwMappedLinkedInOAuthError,
} from '@api/services/integrations/linkedin/utils/linkedin-oauth-error.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import {
  CredentialLinkedinAccountsSerializer,
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/linkedin')
export class LinkedInController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly linkedInService: LinkedInService,
    private readonly linkedInAuthorizedSignalsService: LinkedInAuthorizedSignalsService,
    private readonly historyImportService: SocialSourceHistoryImportService,
  ) {}

  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createCredentialDto: ConnectCredentialDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(url, createCredentialDto);

    const brand = await this.brandsService.findOne({
      id: createCredentialDto.brandId,
      organizationId: user.organizationId,
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    try {
      const { state } = await this.credentialsService.beginOAuthForBrand(
        brand,
        user.userId ?? user.id,
        CredentialPlatform.LINKEDIN,
        {
          isConnected: false,
          isHistoryImportRequested:
            createCredentialDto.isHistoryImportRequested,
        },
        createCredentialDto.credentialId,
      );

      const authUrl = this.linkedInService.generateAuthUrl(state);

      return serializeSingle(request, CredentialOAuthSerializer, {
        url: authUrl,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeLinkedInOAuthErrorLog(error),
      );
      return throwMappedLinkedInOAuthError(
        error,
        'Failed to initiate LinkedIn OAuth',
      );
    }
  }

  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() createCredentialVerifyDto: Partial<CreateCredentialVerifyDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(url, {
      hasCode: Boolean(createCredentialVerifyDto.code),
      hasState: Boolean(createCredentialVerifyDto.state),
    });

    const { code, state } = createCredentialVerifyDto;

    try {
      await throwIfOAuthCallbackError(
        this.credentialsService,
        createCredentialVerifyDto,
        CredentialPlatform.LINKEDIN,
      );

      if (!code || !state) {
        return returnBadRequest({
          detail: 'Missing code or identifiers',
          title: 'Invalid payload',
        });
      }

      const existingCredential =
        await this.credentialsService.findPendingOAuthCredential(
          state,
          CredentialPlatform.LINKEDIN,
        );

      if (!existingCredential) {
        return returnNotFound('Pending OAuth credential', state);
      }

      // Exchange code for access token
      const { accessToken, expiresIn, scope } =
        await this.linkedInService.exchangeAuthCodeForAccessToken(code);

      if (!accessToken) {
        return returnBadRequest({
          detail: 'LinkedIn did not return an access token',
          title: 'Token exchange failed',
        });
      }

      // Calculate token expiry
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);

      // The token is stored but the connection is held back (no identity, not
      // live): the member must still choose whether this brand posts as a
      // company page they run or as their own profile (see `selectAccount`).
      const credential = await this.credentialsService.patch(
        existingCredential.id,
        {
          accessToken,
          accessTokenExpiry: expiryDate,
          isConnected: false,
          isDeleted: false, // Reactivate if previously disconnected
          oauthState: null,
          ...buildGrantedScopesCredentialPatch(scope),
        },
      );

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeLinkedInOAuthErrorLog(error),
      );
      return throwMappedLinkedInOAuthError(
        error,
        'Failed to verify LinkedIn OAuth',
      );
    }
  }

  /**
   * Step 2: the accounts this connection can post as: the member's profile and
   * every company page they hold a posting role on. Read with the credential's
   * own token, so the picker never offers more than a selection will accept
   * (see `selectAccount`).
   */
  @TenantReadPolicy('mutating')
  @RequiredScopes(...API_KEY_CONNECTED_ACCOUNT_READ_SCOPES)
  @Get(':credentialId/accounts')
  async findAllAccounts(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ) {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
      platform: CredentialPlatform.LINKEDIN,
    });

    if (!credential?.accessToken) {
      return returnBadRequest({
        detail: 'LinkedIn account is not connected',
        title: 'Not Connected',
      });
    }

    try {
      const accounts = await this.linkedInService.listAuthorizedAccounts(
        EncryptionUtil.decrypt(credential.accessToken),
      );

      // Flag accounts another live credential of this brand already holds. The
      // picker still lists them: choosing one is a deliberate reconnect that
      // merges into that incumbent.
      const heldAccounts = credential.brandId
        ? await this.credentialsService.findConnectedAccounts(
            user.organizationId,
            credential.brandId,
            CredentialPlatform.LINKEDIN,
          )
        : [];
      const heldExternalIds = new Set(
        heldAccounts
          .filter((account) => account.id !== credential.id)
          .map((account) => account.externalId)
          .filter((externalId): externalId is string => Boolean(externalId)),
      );

      return serializeCollection(
        request,
        CredentialLinkedinAccountsSerializer,
        {
          docs: accounts.map((account) => ({
            ...account,
            isAlreadyConnected: heldExternalIds.has(account.id),
            platform: CredentialPlatform.LINKEDIN,
          })),
        },
      );
    } catch (error: unknown) {
      if (isLinkedinAuthorizationError(error)) {
        throw new HttpException(
          {
            detail:
              'Your LinkedIn connection has expired. Please reconnect your LinkedIn account.',
            title: 'Authentication failed',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      throw error;
    }
  }

  /**
   * Step 3: the member has chosen which account this connection posts as,
   * from `GET :credentialId/accounts`. The page or
   * profile is re-read from LinkedIn with this credential's own token and the
   * request supplies only its id, so a client cannot claim a page the token
   * does not administer. The connection is not live, and publishes nowhere,
   * until this succeeds.
   */
  @Post(':credentialId/select-account')
  async selectAccount(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
    @Body() body: { externalId?: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!body?.externalId) {
      return returnBadRequest({
        detail: 'externalId is required',
        title: 'Invalid payload',
      });
    }

    const credential = await this.credentialsService.findOneSelect(
      {
        id: credentialId,
        organizationId: user.organizationId,
        platform: CredentialPlatform.LINKEDIN,
      },
      {
        accessToken: true,
        externalId: true,
        id: true,
        isConnected: true,
        isDeleted: true,
      },
    );

    if (!credential || credential.isDeleted) {
      return returnNotFound('LinkedIn credential', credentialId);
    }

    if (!credential.accessToken) {
      return returnBadRequest({
        detail: 'LinkedIn account is not connected',
        title: 'Not Connected',
      });
    }

    // Only a token that was exchanged but never assigned an account may be
    // assigned one here. A live connection is changed by reconnecting, never by
    // repointing it onto another account the same token happens to reach.
    if (credential.isConnected || credential.externalId) {
      return returnBadRequest({
        detail:
          'This credential is already connected to an account. Disconnect and reconnect to choose a different one.',
        title: 'Already Connected',
      });
    }

    try {
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const accounts =
        await this.linkedInService.listAuthorizedAccounts(accessToken);
      const chosen = accounts.find((account) => account.id === body.externalId);

      if (!chosen) {
        return returnBadRequest({
          detail:
            'That account is not available to this connection. Reconnect LinkedIn and try again.',
          title: 'Account not available',
        });
      }

      let updated = await this.credentialsService.updateExternalProfile(
        credential.id.toString(),
        user.organizationId,
        {
          avatarUrl: chosen.image,
          // LinkedIn exposes no public handle for a member, only a name. A
          // page's vanity name is its handle; a member's is cleared rather
          // than persisting the display name as one.
          handle:
            chosen.kind === 'organization' ? (chosen.username ?? null) : null,
          id: chosen.id,
          name: chosen.label,
        },
      );

      updated = await this.finalizeConnection({
        accessToken,
        credential: updated,
        organizationId: user.organizationId,
        url,
      });

      return serializeSingle(request, CredentialSerializer, updated);
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeLinkedInOAuthErrorLog(error),
      );
      return throwMappedLinkedInOAuthError(
        error,
        'Failed to connect the selected LinkedIn account',
      );
    }
  }

  /**
   * Post-connection work that must never fail the connection itself: refresh
   * the authorized signals snapshot, then queue the import of the member's
   * existing posts. Both are best-effort and logged on failure.
   */
  private async finalizeConnection(params: {
    accessToken: string;
    credential: Awaited<ReturnType<CredentialsService['patch']>>;
    grantedScopes?: readonly string[];
    organizationId: string;
    url: string;
  }): Promise<Awaited<ReturnType<CredentialsService['patch']>>> {
    const { accessToken, grantedScopes, organizationId, url } = params;
    let credential = params.credential;
    try {
      await this.linkedInAuthorizedSignalsService.refresh({
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
          platform: CredentialPlatform.LINKEDIN,
        })) ?? credential;
    } catch (signalError: unknown) {
      this.loggerService.warn(
        `${url} authorized signal refresh failed after connection`,
        signalError,
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
        scheduleError,
      );
    }
    return credential;
  }

  @Post(':credentialId/authorized-signals/refresh')
  async refreshAuthorizedSignals(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ) {
    await this.linkedInAuthorizedSignalsService.refresh({
      credentialId,
      organizationId: user.organizationId,
    });

    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
      platform: CredentialPlatform.LINKEDIN,
    });

    if (!credential) {
      throw new HttpException(
        {
          detail: 'LinkedIn credential not found',
          title: 'Not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return serializeSingle(request, CredentialSerializer, credential);
  }
}
