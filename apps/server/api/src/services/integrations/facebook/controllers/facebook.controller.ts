import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { throwIfOAuthCallbackError } from '@api/collections/credentials/utils/oauth-callback-error.util';
import {
  claimOAuthVerifyCredential,
  verifiedOAuthState,
} from '@api/collections/credentials/utils/oauth-verify-claim.util';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { SelectFacebookPagesDto } from '@api/services/integrations/facebook/dto/select-facebook-pages.dto';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { FacebookPageConnectionService } from '@api/services/integrations/facebook/services/facebook-page-connection.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { IFacebookPageCandidate } from '@genfeedai/contracts/interfaces/integrations/facebook.interface';
import {
  buildGrantedScopesCredentialPatch,
  parseGrantedOAuthScopes,
} from '@genfeedai/helpers';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/facebook')
export class FacebookController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly facebookService: FacebookService,
    private readonly loggerService: LoggerService,
    private readonly pageConnection: FacebookPageConnectionService,
  ) {}

  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createCredentialDto: ConnectCredentialDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const brand = await this.brandsService.findOne({
      id: createCredentialDto.brandId,
      organizationId: user.organizationId,
    });

    if (!brand) {
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Invalid payload',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.FACEBOOK,
      {
        isConnected: false,
      },
      createCredentialDto.credentialId,
    );

    const authUrl = this.facebookService.generateAuthUrl(state);

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: authUrl,
    });
  }

  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() body: Partial<CreateCredentialVerifyDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    try {
      await throwIfOAuthCallbackError(
        this.credentialsService,
        body,
        CredentialPlatform.FACEBOOK,
      );

      if (!body.code || !body.state) {
        throw new HttpException(
          {
            detail: 'Missing required OAuth parameters',
            title: 'Invalid payload',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const claim = await claimOAuthVerifyCredential(
        this.credentialsService,
        body.state,
        CredentialPlatform.FACEBOOK,
      );
      if (claim?.alreadyConnected) {
        return serializeSingle(request, CredentialSerializer, claim.credential);
      }
      const credential = claim?.credential;

      if (!credential) {
        throw new HttpException(
          {
            detail: 'Facebook credential not found',
            title: 'OAuth Error',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const { organizationId } = credential;

      const { accessToken, expiresIn, scope } =
        await this.facebookService.exchangeAuthCodeForAccessToken(body.code);

      if (!accessToken) {
        throw new HttpException(
          {
            detail: 'Facebook did not return an access token',
            title: 'Token exchange failed',
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      const profile = await this.facebookService.getUserProfile(accessToken);
      const normalizedTokenScopes = parseGrantedOAuthScopes(scope);
      let grantedScopes: unknown =
        normalizedTokenScopes.length > 0 ? normalizedTokenScopes : undefined;
      if (grantedScopes === undefined) {
        try {
          grantedScopes =
            await this.facebookService.getGrantedPermissions(accessToken);
        } catch (permissionError: unknown) {
          this.loggerService.warn(
            `${url} permission capture failed after connection`,
            permissionError,
          );
        }
      }

      const pages = await this.pageConnection.listPagesOrExplain(accessToken);

      // A connection that manages Pages is bound to one Page, because the Page
      // is the channel posts and comments belong to. With several Pages the
      // credential keeps its token and waits for `POST :credentialId/select-
      // page`; the serialized credential then reports `needsAccountSelection`.
      // A user with no Page keeps the user-level connection, which is all Meta
      // Ads needs.
      let updatedCredential = await this.credentialsService.patch(
        credential.id,
        {
          accessToken,
          accessTokenExpiry: expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : undefined,
          isConnected: pages.length === 0,
          isDeleted: false,
          oauthState: verifiedOAuthState(body.state),
          ...buildGrantedScopesCredentialPatch(grantedScopes),
        },
      );

      const [onlyPage] = pages;
      if (pages.length === 0) {
        updatedCredential = await this.credentialsService.updateExternalProfile(
          updatedCredential.id,
          organizationId,
          {
            avatarUrl: profile.picture?.data?.url,
            // A personal Facebook profile has no public @handle through Graph —
            // only a name and (private) email. Never persist either as a handle.
            handle: undefined,
            id: credential.externalId || profile.id,
            name: profile.name,
          },
        );
      } else if (pages.length === 1 && onlyPage) {
        const [connected] = await this.pageConnection.connectPages(
          updatedCredential,
          [onlyPage],
        );
        updatedCredential = connected ?? updatedCredential;
      }

      return serializeSingle(request, CredentialSerializer, updatedCredential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /** The Pages a pending connection can still choose from. */
  @TenantReadPolicy('owner')
  @Get(':credentialId/pages')
  async listPendingPages(
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ): Promise<{ pages: IFacebookPageCandidate[] }> {
    const pages = await this.pageConnection.listCandidates(
      user.organizationId,
      credentialId,
    );
    return { pages };
  }

  /**
   * Settle a pending connection onto the chosen Pages. The first takes this
   * credential and each further one becomes its own credential on the brand.
   */
  @Post(':credentialId/select-page')
  async selectPages(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
    @Body() body: SelectFacebookPagesDto,
  ) {
    const connected = await this.pageConnection.connectChosen(
      user.organizationId,
      credentialId,
      body.pageIds,
    );
    return serializeCollection(request, CredentialSerializer, {
      docs: connected,
    });
  }

  @TenantReadPolicy('selected')
  @Get('pages')
  async getUserPages(@CurrentUser() user: User) {
    const readScope = resolveTenantReadScope(user);
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const pages = await this.facebookService.getUserPages(
      readScope.organizationId,
      readScope.brandId ?? '',
    );

    return { pages };
  }

  @Post('post')
  async createPost(
    @CurrentUser() _user: User,
    @Body()
    body: {
      pageId: string;
      pageAccessToken: string;
      message: string;
      mediaUrl?: string;
      mediaType?: 'image' | 'video';
    },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const { pageId, pageAccessToken, message, mediaUrl, mediaType } = body;

    let postId: string;

    if (mediaUrl && mediaType === 'image') {
      postId = await this.facebookService.uploadImage(
        pageId,
        pageAccessToken,
        mediaUrl,
        message,
      );
    } else if (mediaUrl && mediaType === 'video') {
      postId = await this.facebookService.uploadVideo(
        pageId,
        pageAccessToken,
        mediaUrl,
        message,
        message,
      );
    } else {
      postId = await this.facebookService.createTextPost(
        pageId,
        pageAccessToken,
        message,
      );
    }

    return { postId };
  }

  @Post('schedule')
  async schedulePost(
    @CurrentUser() _user: User,
    @Body()
    body: {
      pageId: string;
      pageAccessToken: string;
      message: string;
      scheduledTime: string;
      mediaUrl?: string;
      mediaType?: 'image' | 'video';
    },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const {
      pageId,
      pageAccessToken,
      message,
      scheduledTime,
      mediaUrl,
      mediaType,
    } = body;

    const scheduledPublishTime = Math.floor(
      new Date(scheduledTime).getTime() / 1000,
    );

    const postId = await this.facebookService.schedulePost(
      pageId,
      pageAccessToken,
      message,
      scheduledPublishTime,
      mediaUrl,
      mediaType,
    );

    return { postId };
  }

  @Get(':facebookId/analytics')
  async getPostAnalytics(
    @CurrentUser() _user: User,
    @Param('facebookId') facebookId: string,
    @Query('accessToken') accessToken: string,
    @Query('mediaType') mediaType?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const analytics =
      mediaType === 'video'
        ? await this.facebookService.getPostAnalytics(
            facebookId,
            accessToken,
            undefined,
            true,
          )
        : await this.facebookService.getPostAnalytics(facebookId, accessToken);

    return analytics;
  }
}
