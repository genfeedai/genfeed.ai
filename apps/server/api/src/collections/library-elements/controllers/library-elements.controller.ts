import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateLibraryElementDto } from '@api/collections/library-elements/dto/create-library-element.dto';
import { LibraryElementsQueryDto } from '@api/collections/library-elements/dto/library-elements-query.dto';
import { UpdateLibraryElementDto } from '@api/collections/library-elements/dto/update-library-element.dto';
import {
  type LibraryElementActor,
  LibraryElementsService,
} from '@api/collections/library-elements/services/library-elements.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { ApiKeyReadAccess } from '@api/helpers/decorators/scopes/api-key-read-access.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { API_KEY_BRAND_EDIT_SCOPES } from '@api/helpers/utils/auth/api-key-route-scope-sets.util';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { LibraryElementSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Locations, styles and props of the current brand (#7374). Characters are
 * listed beside them so the References page reads one collection.
 */
@AutoSwagger()
@Controller('library-elements')
@UseGuards(RolesGuard)
export class LibraryElementsController {
  constructor(private readonly elements: LibraryElementsService) {}

  @Get()
  @ApiKeyReadAccess()
  @TenantReadPolicy('selected')
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: LibraryElementsQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const page = await this.elements.list(this.readScope(user), query);
    return serializeCollection(request, LibraryElementSerializer, {
      ...page,
    });
  }

  @Get(':id')
  @ApiKeyReadAccess()
  @TenantReadPolicy('selected')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    return serializeSingle(
      request,
      LibraryElementSerializer,
      await this.elements.findOne(
        this.readScope(user),
        EntityIdUtil.validate(id, 'libraryElementId'),
      ),
    );
  }

  @Post()
  @RequiredScopes(...API_KEY_BRAND_EDIT_SCOPES)
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: CreateLibraryElementDto,
  ): Promise<JsonApiSingleResponse> {
    return serializeSingle(
      request,
      LibraryElementSerializer,
      await this.elements.create(this.actor(request, user), body),
    );
  }

  @Patch(':id')
  @RequiredScopes(...API_KEY_BRAND_EDIT_SCOPES)
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UpdateLibraryElementDto,
  ): Promise<JsonApiSingleResponse> {
    return serializeSingle(
      request,
      LibraryElementSerializer,
      await this.elements.update(
        this.actor(request, user),
        EntityIdUtil.validate(id, 'libraryElementId'),
        body,
      ),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredScopes(...API_KEY_BRAND_EDIT_SCOPES)
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<void> {
    await this.elements.remove(
      this.actor(request, user),
      EntityIdUtil.validate(id, 'libraryElementId'),
    );
  }

  private readScope(user: User): { brandId: string; organizationId: string } {
    const scope = resolveTenantReadScope(user);
    if (!scope.organizationId || !scope.brandId) {
      throw new BadRequestException({
        detail: 'Organization and brand are required to read elements',
        title: 'Bad Request',
      });
    }
    return { brandId: scope.brandId, organizationId: scope.organizationId };
  }

  private actor(request: Request, user: User): LibraryElementActor {
    if (!user.organizationId || !user.brandId) {
      throw new ValidationException(
        'Organization and brand are required to change elements',
        'brandId',
      );
    }
    return {
      apiKeyContext: user,
      brandId: user.brandId,
      isSuperAdmin: getIsSuperAdmin(user, request),
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    };
  }
}
