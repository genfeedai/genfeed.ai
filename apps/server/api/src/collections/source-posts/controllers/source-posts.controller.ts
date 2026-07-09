import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  SourcePostDraftActionDto,
  SourcePostTwitterActionDto,
} from '@api/collections/source-posts/dto/source-post-action.dto';
import { SourcePostsQueryDto } from '@api/collections/source-posts/dto/source-posts-query.dto';
import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BrandScopeQueryDto } from '@api/helpers/dto/brand-scope-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { resolveRequiredBrandRequestContext } from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { SourcePostSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Source Posts')
@Controller('source-posts')
@UseGuards(RolesGuard)
export class SourcePostsController {
  constructor(private readonly sourcePostsService: SourcePostsService) {}

  @Get()
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SourcePostsQueryDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const result = await this.sourcePostsService.listByBrand(context, query);
    return serializeCollection(request, SourcePostSerializer, { ...result });
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    const post = await this.sourcePostsService.findOneScoped(id, context);
    return serializeSingle(request, SourcePostSerializer, post);
  }

  @Post(':id/actions/draft')
  @HttpCode(HttpStatus.OK)
  createDraft(
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
    @Body() body: SourcePostDraftActionDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    return this.sourcePostsService.createDraftFromPost(id, context, body);
  }

  @Post(':id/actions/twitter')
  @HttpCode(HttpStatus.OK)
  publishTwitterAction(
    @CurrentUser() user: User,
    @Query() query: BrandScopeQueryDto,
    @Param('id') id: string,
    @Body() body: SourcePostTwitterActionDto,
  ) {
    const context = resolveRequiredBrandRequestContext(user, query);
    return this.sourcePostsService.publishTwitterAction(id, context, body);
  }
}
