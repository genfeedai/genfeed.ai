import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreatePostingSetDto } from '@api/collections/posting-sets/dto/create-posting-set.dto';
import { ExpandPostingSetDto } from '@api/collections/posting-sets/dto/expand-posting-set.dto';
import { PostingSetsQueryDto } from '@api/collections/posting-sets/dto/posting-sets-query.dto';
import { UpdatePostingSetDto } from '@api/collections/posting-sets/dto/update-posting-set.dto';
import { PostingSetsService } from '@api/collections/posting-sets/services/posting-sets.service';
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
import type { IPostingSetScope } from '@genfeedai/interfaces';
import { PostingSetSerializer } from '@genfeedai/serializers';
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
@ApiTags('PostingSets')
@Controller('posting-sets')
export class PostingSetsController {
  constructor(private readonly postingSetsService: PostingSetsService) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PostingSetsQueryDto,
  ) {
    const context = this.requireScope(user, query);
    const result = await this.postingSetsService.findAllScoped(context, query);
    return serializeCollection(request, PostingSetSerializer, result);
  }

  @Post()
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreatePostingSetDto,
  ) {
    const context = this.requireScope(user);
    const postingSet = await this.postingSetsService.createScoped(
      body,
      context,
    );
    return serializeSingle(request, PostingSetSerializer, postingSet);
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PostingSetsQueryDto,
    @Param('id') id: string,
  ) {
    const context = this.requireScope(user, query);
    const postingSet = await this.postingSetsService.findOneScoped(id, context);
    return serializeSingle(request, PostingSetSerializer, postingSet);
  }

  @Patch(':id')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: PostingSetsQueryDto,
    @Param('id') id: string,
    @Body() body: UpdatePostingSetDto,
  ) {
    const context = this.requireScope(user, query);
    const postingSet = await this.postingSetsService.updateScoped(
      id,
      body,
      context,
    );
    return serializeSingle(request, PostingSetSerializer, postingSet);
  }

  @Delete(':id')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @CurrentUser() user: User,
    @Query() query: PostingSetsQueryDto,
    @Param('id') id: string,
  ) {
    const context = this.requireScope(user, query);
    await this.postingSetsService.removeScoped(id, context);
    return { success: true };
  }

  @Post(':id/expand')
  @RequiredScopes(...API_KEY_POSTING_CONFIGURATION_SCOPES)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async expand(
    @CurrentUser() user: User,
    @Query() query: PostingSetsQueryDto,
    @Param('id') id: string,
    @Body() body: ExpandPostingSetDto,
  ) {
    const context = this.requireScope(user, query);
    const targets = await this.postingSetsService.expandScoped(
      id,
      body,
      context,
    );
    return { targets };
  }

  private requireScope(
    user: User,
    query?: PostingSetsQueryDto,
  ): IPostingSetScope {
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
