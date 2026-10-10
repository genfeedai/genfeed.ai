import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AcceptTurboProjectQuoteDto } from '@api/collections/turbo-projects/dto/accept-turbo-project-quote.dto';
import { AddTurboProjectItemsDto } from '@api/collections/turbo-projects/dto/add-turbo-project-items.dto';
import { CreateTurboProjectDto } from '@api/collections/turbo-projects/dto/create-turbo-project.dto';
import { GenerateTurboIdeasDto } from '@api/collections/turbo-projects/dto/generate-turbo-ideas.dto';
import { QuoteTurboProjectDto } from '@api/collections/turbo-projects/dto/quote-turbo-project.dto';
import { ReviewTurboProjectItemsDto } from '@api/collections/turbo-projects/dto/review-turbo-project-items.dto';
import { ScheduleTurboProjectDto } from '@api/collections/turbo-projects/dto/schedule-turbo-project.dto';
import { UpdateTurboProjectDto } from '@api/collections/turbo-projects/dto/update-turbo-project.dto';
import { UpdateTurboProjectItemDto } from '@api/collections/turbo-projects/dto/update-turbo-project-item.dto';
import { TurboProjectSchedulingService } from '@api/collections/turbo-projects/services/turbo-project-scheduling.service';
import { TurboProjectsService } from '@api/collections/turbo-projects/services/turbo-projects.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { assertApiKeyPublishingScope } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { ApiKeyScope, MemberRole } from '@genfeedai/contracts';
import type { ITurboProjectScope } from '@genfeedai/contracts/interfaces';
import { TurboProjectSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/** Batch projects produce review drafts, so writing one is a draft action. */
const TURBO_PROJECT_WRITE_SCOPES = [
  ApiKeyScope.POSTS_DRAFT,
  ApiKeyScope.POSTS_CREATE,
] as const;

@AutoSwagger()
@ApiTags('TurboProjects')
@Controller('turbo-projects')
@UseGuards(RolesGuard)
@OrganizationModule('turbo')
export class TurboProjectsController {
  constructor(
    private readonly turboProjectsService: TurboProjectsService,
    private readonly turboProjectSchedulingService: TurboProjectSchedulingService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ) {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
    const result = await this.turboProjectsService.list(
      this.requireScope({
        ...user,
        organizationId: tenant.organizationId,
        brandId:
          tenant.brandId ?? (tenant.isOrganizationOverride ? '' : user.brandId),
      }),
      { ...query, brandId: tenant.brandId },
    );
    return serializeCollection(request, TurboProjectSerializer, result);
  }

  @Post()
  @RequiredScopes(...TURBO_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreateTurboProjectDto,
  ) {
    const project = await this.turboProjectsService.create(
      body,
      this.requireScope(user, request),
    );
    return serializeSingle(request, TurboProjectSerializer, project);
  }

  @TenantReadPolicy('mutating')
  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const project = await this.turboProjectsService.findOne(
      id,
      this.requireScope(user),
    );
    return serializeSingle(request, TurboProjectSerializer, project);
  }

  @Patch(':id')
  @RequiredScopes(...TURBO_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateTurboProjectDto,
  ) {
    const project = await this.turboProjectsService.update(
      id,
      body,
      this.requireScope(user),
    );
    return serializeSingle(request, TurboProjectSerializer, project);
  }

  @Delete(':id')
  @RequiredScopes(...TURBO_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(@CurrentUser() user: User, @Param('id') id: string) {
    await this.turboProjectsService.remove(id, this.requireScope(user));
    return { success: true };
  }

  @Post(':id/items')
  @RequiredScopes(...TURBO_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async addItems(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: AddTurboProjectItemsDto,
  ) {
    const project = await this.turboProjectsService.addItems(
      id,
      body,
      this.requireScope(user),
    );
    return serializeSingle(request, TurboProjectSerializer, project);
  }

  @Patch(':id/items/:itemId')
  @RequiredScopes(...TURBO_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateItem(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateTurboProjectItemDto,
  ) {
    const project = await this.turboProjectsService.updateItem(
      id,
      itemId,
      body,
      this.requireScope(user),
    );
    return serializeSingle(request, TurboProjectSerializer, project);
  }

  @Delete(':id/items/:itemId')
  @RequiredScopes(...TURBO_PROJECT_WRITE_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async removeItem(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    const project = await this.turboProjectsService.removeItem(
      id,
      itemId,
      this.requireScope(user),
    );
    return serializeSingle(request, TurboProjectSerializer, project);
  }

  @Post(':id/ideas')
  @FeatureFlag('turbo_ideas')
  @RequiredScopes(...TURBO_PROJECT_WRITE_SCOPES)
  async generateIdeas(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: GenerateTurboIdeasDto,
  ) {
    const project = await this.turboProjectsService.generateIdeas(
      id,
      body,
      this.requireScope(user, request),
    );
    return serializeSingle(request, TurboProjectSerializer, project);
  }

  @Post(':id/quote')
  @RequiredScopes(...TURBO_PROJECT_WRITE_SCOPES)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async quote(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: QuoteTurboProjectDto,
  ) {
    return {
      data: await this.turboProjectsService.quote(
        id,
        body,
        this.requireScope(user, request),
      ),
    };
  }

  @Post(':id/start')
  @RequiredScopes(...TURBO_PROJECT_WRITE_SCOPES)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async start(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: AcceptTurboProjectQuoteDto,
  ) {
    const project = await this.turboProjectsService.start(
      id,
      this.requireScope(user, request),
      body.quoteId,
    );
    return serializeSingle(request, TurboProjectSerializer, project);
  }

  @Post(':id/items/:itemId/retry')
  @RequiredScopes(...TURBO_PROJECT_WRITE_SCOPES)
  @RolesDecorator(MemberRole.OWNER, MemberRole.ADMIN, MemberRole.CREATOR)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async retryItem(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: AcceptTurboProjectQuoteDto,
  ) {
    const project = await this.turboProjectsService.retryItem(
      id,
      itemId,
      this.requireScope(user, request),
      body.quoteId,
    );
    return serializeSingle(request, TurboProjectSerializer, project);
  }

  @Post(':id/review')
  @RequiredScopes(ApiKeyScope.POSTS_APPROVE)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async review(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: ReviewTurboProjectItemsDto,
  ) {
    assertApiKeyPublishingScope(user, 'approve');
    const project = await this.turboProjectsService.review(
      id,
      body,
      this.requireScope(user),
    );
    return serializeSingle(request, TurboProjectSerializer, project);
  }

  @Post(':id/schedule')
  @RequiredScopes(ApiKeyScope.POSTS_SCHEDULE, ApiKeyScope.POSTS_PUBLISH)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async schedule(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: ScheduleTurboProjectDto,
  ) {
    // A destination without a date, or with one already due, publishes now,
    // which needs publish scope.
    const now = Date.now();
    const isDueNow = (scheduledDate?: string) =>
      !scheduledDate || Date.parse(scheduledDate) <= now;
    if (body.targets.some((target) => !isDueNow(target.scheduledDate))) {
      assertApiKeyPublishingScope(user, 'schedule');
    }
    if (body.targets.some((target) => isDueNow(target.scheduledDate))) {
      assertApiKeyPublishingScope(user, 'publish');
    }
    return this.turboProjectSchedulingService.schedule(
      id,
      body,
      this.requireScope(user),
    );
  }

  private requireScope(user: User, request?: Request): ITurboProjectScope {
    const organizationId = user.organizationId;
    const userId = user.userId ?? user.id;
    if (!organizationId || !userId) {
      throw new BadRequestException(
        'Organization and user context are required',
      );
    }
    return {
      ...(user.brandId ? { brandId: user.brandId } : {}),
      ...(request && getIsSuperAdmin(user, request)
        ? { isSuperAdmin: true }
        : {}),
      organizationId,
      userId,
    };
  }
}
