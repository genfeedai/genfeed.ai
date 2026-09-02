import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateEngagementRuleDto } from '@api/collections/engagement-rules/dto/create-engagement-rule.dto';
import { EngagementRulesQueryDto } from '@api/collections/engagement-rules/dto/engagement-rules-query.dto';
import { UpdateEngagementRuleDto } from '@api/collections/engagement-rules/dto/update-engagement-rule.dto';
import type { EngagementRuleScope } from '@api/collections/engagement-rules/schemas/engagement-rule.schema';
import { EngagementRulesService } from '@api/collections/engagement-rules/services/engagement-rules.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { API_KEY_POSTING_CONFIGURATION_SCOPES } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { EngagementRuleSerializer } from '@genfeedai/serializers';
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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('EngagementRules')
@Controller('engagement-rules')
export class EngagementRulesController {
  constructor(
    private readonly engagementRulesService: EngagementRulesService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: EngagementRulesQueryDto,
  ) {
    const context = this.requireScope(user, query);
    const result = await this.engagementRulesService.findAllScoped(
      context,
      query,
    );
    return serializeCollection(request, EngagementRuleSerializer, result);
  }

  @Post()
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreateEngagementRuleDto,
  ) {
    const context = this.requireScope(user);
    const rule = await this.engagementRulesService.createScoped(body, context);
    return serializeSingle(request, EngagementRuleSerializer, rule);
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: EngagementRulesQueryDto,
    @Param('id') id: string,
  ) {
    const context = this.requireScope(user, query);
    const rule = await this.engagementRulesService.findOneScoped(id, context);
    return serializeSingle(request, EngagementRuleSerializer, rule);
  }

  @Patch(':id')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: EngagementRulesQueryDto,
    @Param('id') id: string,
    @Body() body: UpdateEngagementRuleDto,
  ) {
    const context = this.requireScope(user, query);
    const rule = await this.engagementRulesService.updateScoped(
      id,
      body,
      context,
    );
    return serializeSingle(request, EngagementRuleSerializer, rule);
  }

  @Delete(':id')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @CurrentUser() user: User,
    @Query() query: EngagementRulesQueryDto,
    @Param('id') id: string,
  ) {
    const context = this.requireScope(user, query);
    await this.engagementRulesService.removeScoped(id, context);
    return { success: true };
  }

  private requireScope(
    user: User,
    query?: EngagementRulesQueryDto,
  ): EngagementRuleScope {
    const authorized = CollectionFilterUtil.resolveAuthorizedTenantQuery(
      query ?? {},
      user,
      getIsSuperAdmin(user),
    );
    const organizationId = authorized.organizationId ?? user.organizationId;
    const userId = user.userId ?? user.id;
    if (!organizationId || !userId) {
      throw new BadRequestException(
        'Organization and user context are required',
      );
    }
    const brandId = authorized.brandId ?? user.brandId;
    return {
      ...(brandId ? { brandId } : {}),
      organizationId,
      userId,
    };
  }
}
