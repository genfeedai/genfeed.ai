import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateXAdWatchedAdvertiserDto } from '@api/collections/x-ad-watched-advertisers/dto/create-x-ad-watched-advertiser.dto';
import { UpdateXAdWatchedAdvertiserDto } from '@api/collections/x-ad-watched-advertisers/dto/update-x-ad-watched-advertiser.dto';
import { XAdWatchedAdvertisersQueryDto } from '@api/collections/x-ad-watched-advertisers/dto/x-ad-watched-advertisers-query.dto';
import type { XAdWatchedAdvertiserDocument } from '@api/collections/x-ad-watched-advertisers/schemas/x-ad-watched-advertiser.schema';
import { XAdWatchedAdvertisersService } from '@api/collections/x-ad-watched-advertisers/services/x-ad-watched-advertisers.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { PrismaFindAllInput } from '@api/shared/services/base/base.service';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { XAdWatchedAdvertiserSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('X Ad Watched Advertisers')
@AutoSwagger()
@Controller('x-ad-watched-advertisers')
@UseGuards(RolesGuard)
export class XAdWatchedAdvertisersController extends BaseCRUDController<
  XAdWatchedAdvertiserDocument,
  CreateXAdWatchedAdvertiserDto,
  UpdateXAdWatchedAdvertiserDto,
  XAdWatchedAdvertisersQueryDto
> {
  constructor(
    public readonly xAdWatchedAdvertisersService: XAdWatchedAdvertisersService,
    public readonly loggerService: LoggerService,
  ) {
    super(
      loggerService,
      xAdWatchedAdvertisersService,
      XAdWatchedAdvertiserSerializer,
      'XAdWatchedAdvertiser',
      [],
    );
  }

  override buildFindAllQuery(
    user: User,
    query: XAdWatchedAdvertisersQueryDto,
  ): PrismaFindAllInput {
    const organizationId = this.resolveTenantOrganizationId(user);
    const match: Record<string, unknown> = {
      isDeleted: query.isDeleted ?? false,
      organizationId,
    };

    if (query.brandId || user.brandId) {
      match.brandId = CollectionFilterUtil.buildAuthorizedBrandFilter(
        query.brandId,
        user,
        getIsSuperAdmin(user),
      );
    }

    if (query.advertiserHandle) {
      match.advertiserHandle = query.advertiserHandle;
    }

    return {
      orderBy: handleQuerySort(query.sort),
      where: match,
    };
  }

  override buildFindOneQuery(user: User, id: string): Record<string, unknown> {
    return {
      id,
      isDeleted: false,
      organizationId: this.resolveTenantOrganizationId(user),
    };
  }

  override enrichCreateDto(
    createDto: Partial<CreateXAdWatchedAdvertiserDto>,
    user: User,
  ): CreateXAdWatchedAdvertiserDto {
    const organizationId = this.resolveTenantOrganizationId(user);
    const requestedBrandId = createDto.brandId ?? user.brandId;
    const brandId = requestedBrandId
      ? CollectionFilterUtil.buildAuthorizedBrandFilter(
          requestedBrandId,
          user,
          getIsSuperAdmin(user),
        )
      : undefined;

    if (brandId && typeof brandId !== 'string') {
      throw new ForbiddenException({
        detail: 'An authenticated brand is required',
        title: 'Forbidden',
      });
    }

    return {
      ...createDto,
      ...(brandId ? { brandId } : {}),
      organizationId,
    } as CreateXAdWatchedAdvertiserDto;
  }

  @Patch(':id')
  override async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateXAdWatchedAdvertiserDto,
  ): Promise<JsonApiSingleResponse> {
    const organizationId = this.resolveTenantOrganizationId(user);
    const data = await this.xAdWatchedAdvertisersService.patchScoped(
      id,
      updateDto,
      {
        ...(user.brandId ? { brandId: user.brandId } : {}),
        organizationId,
      },
    );
    if (!data) {
      ErrorResponse.notFound('XAdWatchedAdvertiser', id);
    }

    return serializeSingle(request, XAdWatchedAdvertiserSerializer, data);
  }

  @Delete(':id')
  override async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const organizationId = this.resolveTenantOrganizationId(user);
    const data = await this.xAdWatchedAdvertisersService.removeScoped(id, {
      ...(user.brandId ? { brandId: user.brandId } : {}),
      organizationId,
    });
    if (!data) {
      ErrorResponse.notFound('XAdWatchedAdvertiser', id);
    }

    return serializeSingle(request, XAdWatchedAdvertiserSerializer, data);
  }

  private resolveTenantOrganizationId(user: User): string {
    const tenantScope = CollectionFilterUtil.resolveAuthorizedTenantQuery(
      {},
      user,
      false,
    );

    if (!tenantScope.organizationId) {
      throw new ForbiddenException({
        detail: 'An authenticated organization is required',
        title: 'Forbidden',
      });
    }

    return tenantScope.organizationId;
  }

  override canUserModifyEntity(
    user: User,
    entity: XAdWatchedAdvertiserDocument,
  ): boolean {
    const entityRecord = entity as unknown as {
      organizationId?: string | null;
      brandId?: string | null;
    };

    if (
      entityRecord.organizationId &&
      user.organizationId &&
      entityRecord.organizationId === user.organizationId &&
      (!user.brandId || entityRecord.brandId === user.brandId)
    ) {
      return true;
    }

    return getIsSuperAdmin(user);
  }

  override canUserReadEntity(
    user: User,
    entity: XAdWatchedAdvertiserDocument,
  ): boolean {
    return this.canUserModifyEntity(user, entity);
  }
}
