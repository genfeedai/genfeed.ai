import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateSocialSourceDto } from '@api/collections/social-sources/dto/create-social-source.dto';
import { SocialSourcesQueryDto } from '@api/collections/social-sources/dto/social-sources-query.dto';
import { SyncSocialSourceDto } from '@api/collections/social-sources/dto/sync-social-source.dto';
import { UpdateSocialSourceDto } from '@api/collections/social-sources/dto/update-social-source.dto';
import { SocialSourcesService } from '@api/collections/social-sources/services/social-sources.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  extractRequestContext,
  getIsSuperAdmin,
} from '@api/helpers/utils/auth/auth.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { SocialSourceSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Social Sources')
@Controller('social-sources')
@UseGuards(RolesGuard)
export class SocialSourcesController {
  constructor(private readonly socialSourcesService: SocialSourcesService) {}

  @Get('feed')
  getFeed(@CurrentUser() user: User, @Query() query: SocialSourcesQueryDto) {
    const context = resolveContext(user, query);
    return this.socialSourcesService.getFeed(context, query);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validate(@Body() body: { platform: string; handle: string }) {
    return this.socialSourcesService.validateSource(body.platform, body.handle);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  syncBrand(
    @CurrentUser() user: User,
    @Query() query: SocialSourcesQueryDto,
    @Body() body: SyncSocialSourceDto,
  ) {
    const context = resolveContext(user, query);
    return this.socialSourcesService.syncBrand(context, {
      limit: body.limit,
    });
  }

  @Get()
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SocialSourcesQueryDto,
  ) {
    const context = resolveContext(user, query);
    const result = await this.socialSourcesService.findAllScoped(
      context,
      query,
    );
    return serializeCollection(request, SocialSourceSerializer, result);
  }

  @Post()
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreateSocialSourceDto,
  ) {
    const context = resolveContext(user, {});
    const source = await this.socialSourcesService.createScoped(body, context);
    return serializeSingle(request, SocialSourceSerializer, source);
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SocialSourcesQueryDto,
    @Param('id') id: string,
  ) {
    const context = resolveContext(user, query);
    const source = await this.socialSourcesService.findOneScoped(id, context);
    return serializeSingle(request, SocialSourceSerializer, source);
  }

  @Patch(':id')
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SocialSourcesQueryDto,
    @Param('id') id: string,
    @Body() body: UpdateSocialSourceDto,
  ) {
    const context = resolveContext(user, query);
    const source = await this.socialSourcesService.updateScoped(
      id,
      body,
      context,
    );
    return serializeSingle(request, SocialSourceSerializer, source);
  }

  @Delete(':id')
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: SocialSourcesQueryDto,
    @Param('id') id: string,
  ) {
    const context = resolveContext(user, query);
    const source = await this.socialSourcesService.removeScoped(id, context);
    return serializeSingle(request, SocialSourceSerializer, source);
  }

  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  syncOne(
    @CurrentUser() user: User,
    @Query() query: SocialSourcesQueryDto,
    @Param('id') id: string,
    @Body() body: SyncSocialSourceDto,
  ) {
    const context = resolveContext(user, query);
    return this.socialSourcesService.syncSource(id, context, {
      limit: body.limit,
    });
  }
}

function resolveContext(
  user: User,
  query: { brand?: string; organization?: string },
) {
  const requestContext = extractRequestContext(user);
  const canOverrideScope = getIsSuperAdmin(user);
  const organizationId =
    canOverrideScope && query.organization
      ? query.organization
      : requestContext.organizationId;
  const brandId =
    canOverrideScope && query.brand ? query.brand : requestContext.brandId;
  const userId = requestContext.userId || user.id;

  if (!organizationId || !brandId || !userId) {
    throw new HttpException(
      'Organization, brand, and user context are required',
      HttpStatus.BAD_REQUEST,
    );
  }

  return { brandId, organizationId, userId };
}
