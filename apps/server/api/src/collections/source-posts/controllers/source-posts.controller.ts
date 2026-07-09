import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  SourcePostDraftActionDto,
  SourcePostTwitterActionDto,
} from '@api/collections/source-posts/dto/source-post-action.dto';
import { SourcePostsQueryDto } from '@api/collections/source-posts/dto/source-posts-query.dto';
import { SourcePostsService } from '@api/collections/source-posts/services/source-posts.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
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
  HttpException,
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
    const context = resolveContext(user, query);
    const result = await this.sourcePostsService.listByBrand(context, query);
    return serializeCollection(request, SourcePostSerializer, result);
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SourcePostsQueryDto,
    @Param('id') id: string,
  ) {
    const context = resolveContext(user, query);
    const post = await this.sourcePostsService.findOneScoped(id, context);
    return serializeSingle(request, SourcePostSerializer, post);
  }

  @Post(':id/actions/draft')
  @HttpCode(HttpStatus.OK)
  createDraft(
    @CurrentUser() user: User,
    @Query() query: SourcePostsQueryDto,
    @Param('id') id: string,
    @Body() body: SourcePostDraftActionDto,
  ) {
    const context = resolveContext(user, query);
    return this.sourcePostsService.createDraftFromPost(id, context, body);
  }

  @Post(':id/actions/twitter')
  @HttpCode(HttpStatus.OK)
  publishTwitterAction(
    @CurrentUser() user: User,
    @Query() query: SourcePostsQueryDto,
    @Param('id') id: string,
    @Body() body: SourcePostTwitterActionDto,
  ) {
    const context = resolveContext(user, query);
    return this.sourcePostsService.publishTwitterAction(id, context, body);
  }
}

function resolveContext(
  user: User,
  query: { brand?: string; organization?: string },
) {
  const publicMetadata = getPublicMetadata(user);
  const canOverrideScope = publicMetadata.isSuperAdmin === true;
  const organizationId =
    canOverrideScope && query.organization
      ? query.organization
      : publicMetadata.organization;
  const brandId =
    canOverrideScope && query.brand ? query.brand : publicMetadata.brand;
  const userId = publicMetadata.user || user.id;

  if (!organizationId || !brandId || !userId) {
    throw new HttpException(
      'Organization, brand, and user context are required',
      HttpStatus.BAD_REQUEST,
    );
  }

  return { brandId, organizationId, userId };
}
