import { CreateLinkDto } from '@api/collections/links/dto/create-link.dto';
import { LinksQueryDto } from '@api/collections/links/dto/links-query.dto';
import { UpdateLinkDto } from '@api/collections/links/dto/update-link.dto';
import {
  Link,
  type LinkDocument,
} from '@api/collections/links/schemas/link.schema';
import { LinksService } from '@api/collections/links/services/links.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CacheService } from '@api/services/cache/services/cache.service';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { PopulateBuilder } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
import type {
  JsonApiSingleResponse,
  PopulateOption,
} from '@genfeedai/interfaces';
import { LinkSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
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
    super(loggerService, linksService, LinkSerializer, Link.name);
  }

  /**
   * Override enrichCreateDto to not add user field (use brand instead)
   */
  public enrichCreateDto(createDto: CreateLinkDto, user: User): CreateLinkDto {
    const publicMetadata: unknown = user.publicMetadata;
    const enriched: unknown = { ...createDto };

    // Links are associated with accounts, not users
    if (publicMetadata.brand) {
      enriched.brand = publicMetadata.brand;
    }

    // Do NOT add user field - Link schema doesn't have it
    return enriched;
  }

  /**
   * Override enrichUpdateDto to not add user field
   */
  public async enrichUpdateDto(
    updateDto: UpdateLinkDto,
  ): Promise<UpdateLinkDto> {
    const enriched: unknown = { ...updateDto };

    // Only add brand if it's being updated
    if (enriched.brand) {
      enriched.brand = enriched.brand;
    }

    // Do NOT add user field - Link schema doesn't have it
    return await Promise.resolve(enriched);
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
  public canUserModifyEntity(user: User, entity: unknown): boolean {
    const publicMetadata: unknown = user.publicMetadata;

    // Check brand ownership
    const entityAccountId =
      entity.brand?._id?.toString() || entity.brand?.toString();
    return entityAccountId === publicMetadata.brand;
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Body() createLinkDto: CreateLinkDto,
  ): Promise<JsonApiSingleResponse> {
    const result = await super.create(request, _user, createLinkDto);

    // Invalidate brands and links cache for brand list endpoints
    // Note: Brand findOne is not cached (see brands.controller.ts) to avoid stale
    // Mongoose virtuals, so no need to invalidate specific brand cache keys
    // @ts-expect-error TS2532
    await this.cacheService.invalidateByTags(['brands', 'links']);

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
    // Mongoose virtuals, so no need to invalidate specific brand cache keys
    // @ts-expect-error TS2532
    await this.cacheService.invalidateByTags(['brands', 'links']);

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
    // Mongoose virtuals, so no need to invalidate specific brand cache keys
    // @ts-expect-error TS2532
    await this.cacheService.invalidateByTags(['brands', 'links']);

    return result;
  }
}
