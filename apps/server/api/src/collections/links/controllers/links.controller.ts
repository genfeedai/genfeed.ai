import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateLinkDto } from '@api/collections/links/dto/create-link.dto';
import { LinksQueryDto } from '@api/collections/links/dto/links-query.dto';
import { UpdateLinkDto } from '@api/collections/links/dto/update-link.dto';
import type { LinkDocument } from '@api/collections/links/schemas/link.schema';
import { LinksService } from '@api/collections/links/services/links.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { CacheService } from '@api/services/cache/cache.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { PopulateBuilder } from '@api/shared/utils/populate/populate.util';
import { requireRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import type {
  JsonApiSingleResponse,
  PopulateOption,
} from '@genfeedai/contracts/interfaces';
import { LinkSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Optional,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('links')
export class LinksController extends BaseCRUDController<
  LinkDocument,
  CreateLinkDto,
  UpdateLinkDto,
  LinksQueryDto
> {
  constructor(
    public readonly linksService: LinksService,
    public readonly loggerService: LoggerService,
    @Optional() private readonly cacheService?: CacheService,
  ) {
    super(loggerService, linksService, LinkSerializer, 'Link');
  }

  /**
   * List links for a brand (preferred over nested `GET /brands/:id/links`).
   * Links have no organization column; reject unauthorized organization query
   * params and default brand to the session brand when omitted.
   */
  public buildFindAllQuery(user: User, query: LinksQueryDto) {
    const isSuperAdmin = getIsSuperAdmin(user);
    const scope = CollectionFilterUtil.resolveAuthorizedTenantQuery(
      query,
      user,
      isSuperAdmin,
    );

    if (
      !isSuperAdmin &&
      (!user.brandId ||
        (scope.brandId && String(scope.brandId) !== String(user.brandId)))
    ) {
      throw new ForbiddenException({
        detail: 'Access denied to this brand',
        title: 'Forbidden',
      });
    }

    // `model Link` has no `organizationId` — `brandId` is the only tenancy
    // boundary, so this filter must always be present. `requireRelationId`
    // fails closed instead of allowing an empty tenant filter.
    const brandId = requireRelationId(
      isSuperAdmin ? (scope.brandId ?? user.brandId) : user.brandId,
      'brand',
      'Link list query',
    );

    return {
      orderBy: handleQuerySort(query.sort),
      where: {
        brandId,
        isDeleted: query.isDeleted ?? false,
      },
    };
  }

  /**
   * Links attach to the brand named in the body (the brand-create flow adds
   * the website link to the brand it just made, which is not yet the session
   * brand), falling back to the session brand. Links have no user column.
   */
  public enrichCreateDto(createDto: CreateLinkDto, user: User): CreateLinkDto {
    const dto = super.enrichCreateDto(createDto, user) as CreateLinkDto & {
      userId?: string;
    };
    delete dto.userId;

    return { ...dto, brandId: createDto.brandId ?? user.brandId ?? '' };
  }

  /**
   * A body `brandId` moves the link. Without the check below a member could
   * move their own link onto another organization's brand, where it shows on
   * that brand's public page.
   */
  public async enrichUpdateDto(
    updateDto: UpdateLinkDto,
    user: User,
  ): Promise<UpdateLinkDto> {
    const dto = await super.enrichUpdateDto(updateDto, user);

    if (dto.brandId !== undefined) {
      await this.assertBrandInCallerOrganization(dto.brandId, user);
    }

    return dto;
  }

  /**
   * `model Link` has no `organizationId`, so the base controller cannot pin
   * a new or moved link to the caller's organization. Check the brand instead.
   */
  private async assertBrandInCallerOrganization(
    brandId: string,
    user: User,
  ): Promise<void> {
    if (getIsSuperAdmin(user)) {
      return;
    }

    const isOwnBrand =
      Boolean(brandId) &&
      Boolean(user.organizationId) &&
      (await this.linksService.isBrandInOrganization(
        brandId,
        user.organizationId,
      ));

    if (!isOwnBrand) {
      throw new ForbiddenException({
        detail: 'Access denied to this brand',
        title: 'Forbidden',
      });
    }
  }

  /**
   * Override getPopulateForOwnershipCheck to use brand instead of user
   */
  public getPopulateForOwnershipCheck(): PopulateOption[] {
    return [PopulateBuilder.idOnly('brand')];
  }

  /**
   * Override canUserModifyEntity to use brand-based authorization
   */
  public canUserModifyEntity(user: User, entity: LinkDocument): boolean {
    return entity.brandId === user.brandId;
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Body() createLinkDto: CreateLinkDto,
  ): Promise<JsonApiSingleResponse> {
    await this.assertBrandInCallerOrganization(
      this.enrichCreateDto(createLinkDto, _user).brandId,
      _user,
    );
    const result = await super.create(request, _user, createLinkDto);

    // Invalidate brands and links cache for brand list endpoints
    // Note: Brand findOne is not cached (see brands.controller.ts) to avoid stale
    // relation-heavy payloads, so no need to invalidate specific brand cache keys
    await this.cacheService?.invalidateByTags(['brands', 'links']);

    return result;
  }

  @Patch(':linkId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async patch(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('linkId') linkId: string,
    @Body() updateLinkDto: UpdateLinkDto,
  ): Promise<JsonApiSingleResponse> {
    const result = await super.patch(request, _user, linkId, updateLinkDto);

    // Invalidate brands and links cache for brand list endpoints
    // Note: Brand findOne is not cached (see brands.controller.ts) to avoid stale
    // relation-heavy payloads, so no need to invalidate specific brand cache keys
    await this.cacheService?.invalidateByTags(['brands', 'links']);

    return result;
  }

  @Delete(':linkId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Param('linkId') linkId: string,
  ): Promise<JsonApiSingleResponse> {
    const result = await super.remove(request, _user, linkId);

    // Invalidate brands and links cache for brand list endpoints
    // Note: Brand findOne is not cached (see brands.controller.ts) to avoid stale
    // relation-heavy payloads, so no need to invalidate specific brand cache keys
    await this.cacheService?.invalidateByTags(['brands', 'links']);

    return result;
  }
}
