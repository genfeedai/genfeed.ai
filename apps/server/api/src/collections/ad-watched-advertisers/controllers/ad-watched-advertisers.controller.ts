import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AdWatchedAdvertisersQueryDto } from '@api/collections/ad-watched-advertisers/dto/ad-watched-advertisers-query.dto';
import { CreateAdWatchedAdvertiserDto } from '@api/collections/ad-watched-advertisers/dto/create-ad-watched-advertiser.dto';
import { UpdateAdWatchedAdvertiserDto } from '@api/collections/ad-watched-advertisers/dto/update-ad-watched-advertiser.dto';
import type { AdWatchedAdvertiserDocument } from '@api/collections/ad-watched-advertisers/schemas/ad-watched-advertiser.schema';
import { AdWatchedAdvertisersService } from '@api/collections/ad-watched-advertisers/services/ad-watched-advertisers.service';
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
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { AdWatchedAdvertiserSerializer } from '@genfeedai/serializers';
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

@ApiTags('Ad Watched Advertisers')
@AutoSwagger()
@Controller('ad-watched-advertisers')
@UseGuards(RolesGuard)
export class AdWatchedAdvertisersController extends BaseCRUDController<
  AdWatchedAdvertiserDocument,
  CreateAdWatchedAdvertiserDto,
  UpdateAdWatchedAdvertiserDto,
  AdWatchedAdvertisersQueryDto
> {
  constructor(
    public readonly adWatchedAdvertisersService: AdWatchedAdvertisersService,
    public readonly loggerService: LoggerService,
  ) {
    super(
      loggerService,
      adWatchedAdvertisersService,
      AdWatchedAdvertiserSerializer,
      'AdWatchedAdvertiser',
      [],
    );
  }

  override buildFindAllQuery(
    user: User,
    query: AdWatchedAdvertisersQueryDto,
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

    if (query.platform) {
      match.platform = query.platform;
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
    createDto: Partial<CreateAdWatchedAdvertiserDto>,
    user: User,
  ): CreateAdWatchedAdvertiserDto {
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
    } as CreateAdWatchedAdvertiserDto;
  }

  @Patch(':id')
  override async patch(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateAdWatchedAdvertiserDto,
  ): Promise<JsonApiSingleResponse> {
    const organizationId = this.resolveTenantOrganizationId(user);
    const data = await this.adWatchedAdvertisersService.patchScoped(
      id,
      updateDto,
      {
        ...(user.brandId ? { brandId: user.brandId } : {}),
        organizationId,
      },
    );
    if (!data) {
      ErrorResponse.notFound('AdWatchedAdvertiser', id);
    }

    return serializeSingle(request, AdWatchedAdvertiserSerializer, data);
  }

  @Delete(':id')
  override async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const organizationId = this.resolveTenantOrganizationId(user);
    const data = await this.adWatchedAdvertisersService.removeScoped(id, {
      ...(user.brandId ? { brandId: user.brandId } : {}),
      organizationId,
    });
    if (!data) {
      ErrorResponse.notFound('AdWatchedAdvertiser', id);
    }

    return serializeSingle(request, AdWatchedAdvertiserSerializer, data);
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
    entity: AdWatchedAdvertiserDocument,
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
    entity: AdWatchedAdvertiserDocument,
  ): boolean {
    return this.canUserModifyEntity(user, entity);
  }
}
