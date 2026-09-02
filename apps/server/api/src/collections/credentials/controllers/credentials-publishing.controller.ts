import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AssessAccountHealthDto } from '@api/collections/credentials/dto/assess-account-health.dto';
import {
  CredentialPostingTimeDto,
  NextPostingSlotQueryDto,
  ReplaceCredentialPostingTimesDto,
} from '@api/collections/credentials/dto/credential-posting-time.dto';
import { ManualAccountHealthOverrideDto } from '@api/collections/credentials/dto/manual-account-health-override.dto';
import { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { CredentialPostingTimesService } from '@api/collections/credentials/services/credential-posting-times.service';
import { CredentialPublishingOperationsService } from '@api/collections/credentials/services/credential-publishing-operations.service';
import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { API_KEY_POSTING_CONFIGURATION_SCOPES } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import type {
  AccountHealthSummary,
  ContentSurface,
  IPublishingProviderReadiness,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

function toContentSurface(surface: unknown): ContentSurface {
  const value = typeof surface === 'string' ? surface : '';
  const allowed: ContentSurface[] = [
    'article',
    'image',
    'newsletter',
    'post',
    'thread',
    'video',
    'x-article',
  ];

  return allowed.includes(value as ContentSurface)
    ? (value as ContentSurface)
    : 'post';
}

@AutoSwagger()
@Controller('credentials')
@UseGuards(RolesGuard)
export class CredentialsPublishingController {
  constructor(
    private readonly accountHealthService: AccountHealthService,
    private readonly accountPublishingContextService: AccountPublishingContextService,
    private readonly credentialPostingTimesService: CredentialPostingTimesService,
    private readonly credentialPublishingOperationsService: CredentialPublishingOperationsService,
    private readonly credentialPublishingReadinessService: CredentialPublishingReadinessService,
  ) {}

  @Get('brand/:brandId/account-health')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.listBrandAccountHealth',
    summary: 'listBrandAccountHealth',
  })
  async listBrandAccountHealth(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ): Promise<AccountHealthSummary[]> {
    return this.accountHealthService.listBrandHealth(
      user.organizationId,
      brandId,
    );
  }

  @Get('brand/:brandId/publishing-readiness')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.listBrandPublishingReadiness',
    summary: 'listBrandPublishingReadiness',
  })
  async listBrandPublishingReadiness(
    @Param('brandId') brandId: string,
    @CurrentUser() user: User,
  ): Promise<IPublishingProviderReadiness[]> {
    return this.credentialPublishingReadinessService.resolveForBrand(
      user.organizationId,
      brandId,
    );
  }

  @Get(':credentialId/posting-times')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.listPostingTimes',
    summary: 'listPostingTimes',
  })
  async listPostingTimes(
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: User,
  ) {
    const times = await this.credentialPostingTimesService.list(
      user.organizationId,
      credentialId,
    );
    return { times };
  }

  @Put(':credentialId/posting-times')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.replacePostingTimes',
    summary: 'replacePostingTimes',
  })
  async replacePostingTimes(
    @Param('credentialId') credentialId: string,
    @Body() dto: ReplaceCredentialPostingTimesDto,
    @CurrentUser() user: User,
  ) {
    const times = await this.credentialPostingTimesService.replace(
      user.organizationId,
      credentialId,
      dto.times,
    );
    return { times };
  }

  @Post(':credentialId/posting-times')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.addPostingTime',
    summary: 'addPostingTime',
  })
  async addPostingTime(
    @Param('credentialId') credentialId: string,
    @Body() dto: CredentialPostingTimeDto,
    @CurrentUser() user: User,
  ) {
    const times = await this.credentialPostingTimesService.add(
      user.organizationId,
      credentialId,
      dto,
    );
    return { times };
  }

  @Delete(':credentialId/posting-times')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.removePostingTime',
    summary: 'removePostingTime',
  })
  async removePostingTime(
    @Param('credentialId') credentialId: string,
    @Body() dto: CredentialPostingTimeDto,
    @CurrentUser() user: User,
  ) {
    const times = await this.credentialPostingTimesService.remove(
      user.organizationId,
      credentialId,
      dto,
    );
    return { times };
  }

  @Get(':credentialId/next-slot')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.findNextPostingSlot',
    summary: 'findNextPostingSlot',
  })
  async findNextPostingSlot(
    @Param('credentialId') credentialId: string,
    @Query() query: NextPostingSlotQueryDto,
    @CurrentUser() user: User,
  ) {
    return this.credentialPostingTimesService.findNextSlot(
      user.organizationId,
      credentialId,
      query.after,
    );
  }

  @Get(':credentialId/publishing-context')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.getPublishingContext',
    summary: 'getPublishingContext',
  })
  async getPublishingContext(
    @Param('credentialId') credentialId: string,
    @Query('surface') surface: string | undefined,
    @CurrentUser() user: User,
  ) {
    return this.accountPublishingContextService.resolve({
      brandId: user.brandId,
      credentialId,
      organizationId: user.organizationId,
      surface: toContentSurface(surface),
    });
  }

  @Post(':credentialId/account-health/assess')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.assessAccountHealth',
    summary: 'assessAccountHealth',
  })
  async assessAccountHealth(
    @Param('credentialId') credentialId: string,
    @Body() dto: AssessAccountHealthDto,
    @CurrentUser() user: User,
  ): Promise<AccountHealthSummary> {
    return this.accountHealthService.assessCredentialHealth({
      brandId: user.brandId,
      credentialId,
      organizationId: user.organizationId,
      request: dto,
    });
  }

  @Patch(':credentialId/account-health/override')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.overrideAccountHealth',
    summary: 'overrideAccountHealth',
  })
  async overrideAccountHealth(
    @Param('credentialId') credentialId: string,
    @Body() dto: ManualAccountHealthOverrideDto,
    @CurrentUser() user: User,
  ): Promise<AccountHealthSummary> {
    return this.accountHealthService.confirmManualOverride({
      credentialId,
      organizationId: user.organizationId,
      request: dto,
      userId: user.userId ?? user.id,
    });
  }

  @Get('mentions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.getMentions',
    summary: 'getMentions',
  })
  getMentions(@CurrentUser() user: User) {
    return this.credentialPublishingOperationsService.getMentions(
      user.organizationId,
    );
  }

  @Get(':credentialId/quota')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'CredentialsController.getQuotaStatus',
    summary: 'getQuotaStatus',
  })
  getQuotaStatus(
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    return this.credentialPublishingOperationsService.getQuotaStatus(
      credentialId,
      user.organizationId,
    );
  }
}
