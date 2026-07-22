import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import { UpdateFolderDto } from '@api/collections/folders/dto/update-folder.dto';
import {
  Folder,
  type FolderDocument,
} from '@api/collections/folders/schemas/folder.schema';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { FolderSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@Controller('folders')
@ApiTags('folders')
@ApiBearerAuth()
@AutoSwagger()
@UseGuards(RolesGuard)
export class FoldersController extends BaseCRUDController<
  FolderDocument,
  CreateFolderDto,
  UpdateFolderDto,
  BaseQueryDto
> {
  constructor(
    public readonly foldersService: FoldersService,
    public readonly loggerService: LoggerService,
  ) {
    super(loggerService, foldersService, FolderSerializer, 'Folder');
  }

  @Get(':id')
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') folderId: string,
  ): Promise<JsonApiSingleResponse> {
    if (!isEntityId(folderId)) {
      ErrorResponse.notFound(this.entityName, folderId);
    }

    const { brand: brandId, organization: organizationId } =
      getPublicMetadata(user);
    const isSuperAdmin = getIsSuperAdmin(user, request);
    const folderQuery: Record<string, unknown> = {
      _id: folderId,
      isDeleted: false,
    };
    if (!isSuperAdmin) {
      folderQuery.organizationId = organizationId;
    }
    const data = await this.foldersService.findOne(folderQuery);

    if (
      !data ||
      (!isSuperAdmin && !this.isFolderInScope(data, organizationId, brandId))
    ) {
      ErrorResponse.notFound(this.entityName, folderId);
    }

    return serializeSingle(request, FolderSerializer, data);
  }

  @Patch(':folderId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('folderId') folderId: string,
    @Body() updateDto: UpdateFolderDto,
  ) {
    return super.patch(request, user, folderId, updateDto);
  }

  @Delete(':folderId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('folderId') folderId: string,
  ) {
    return super.remove(request, user, folderId);
  }

  /**
   * Override the base pipeline to load folders with proper filtering:
   * - Members: shared organization folders + current-brand folders
   * - Superadmin brand filter: shared + selected-brand folders in the selected org
   * - Superadmin organization filter: every folder in the selected org
   *
   * The OR branches are built with scalar foreign-key fields (`brandId`,
   * `organizationId`, `userId`) rather than Prisma relation accessors
   * (`brand`, `organization`, `user`). Relation accessors expect a nested
   * filter object, so emitting `{ brand: null }` reached Prisma as an invalid
   * relation filter and crashed list queries in production (#565). Scalar FKs
   * keep this query valid at the source, independent of downstream normalization.
   */
  public buildFindAllQuery(user: User, query: BaseQueryDto) {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    // Check if brand or organization query params are provided
    const requestedBrandId =
      (query as unknown as Record<string, string | undefined>).brand || null;
    const requestedOrganizationId =
      (query as unknown as Record<string, string | undefined>).organization ||
      null;
    const isSuperAdmin = getIsSuperAdmin(user);

    const matchStage: Record<string, unknown> & {
      OR?: Array<Record<string, unknown>>;
    } = {
      isDeleted: query.isDeleted ?? false,
    };

    if (isSuperAdmin && (requestedBrandId || requestedOrganizationId)) {
      const scopedOrganizationId = requestedOrganizationId || organizationId;
      if (requestedBrandId) {
        matchStage.OR = this.buildFolderScope(
          scopedOrganizationId,
          requestedBrandId,
        );
      } else {
        matchStage.organizationId = scopedOrganizationId;
      }
    } else if (
      (requestedBrandId &&
        requestedBrandId !== publicMetadata.brand?.toString()) ||
      (requestedOrganizationId && requestedOrganizationId !== organizationId)
    ) {
      matchStage.id = { in: [] };
    } else if (requestedBrandId) {
      // Brand context: show organization folders without brand + brand folders.
      matchStage.OR = this.buildFolderScope(organizationId, requestedBrandId);
    } else {
      // Members stay in shared + current-brand scope even when the caller
      // repeats its own organization in the query.
      matchStage.OR = this.buildFolderScope(
        organizationId,
        requestedBrandId || publicMetadata.brand,
      );
    }

    return { where: matchStage, orderBy: { createdAt: -1, label: 1 } };
  }

  public override enrichCreateDto(
    createDto: Partial<CreateFolderDto>,
    user: User,
  ): CreateFolderDto {
    const publicMetadata = getPublicMetadata(user);
    const requestedBrandId = createDto.brand?.toString();

    if (
      requestedBrandId &&
      requestedBrandId !== publicMetadata.brand?.toString()
    ) {
      ErrorResponse.notFound('Brand', requestedBrandId);
    }

    const { brand: _brand, ...folderDto } = createDto;

    return {
      ...folderDto,
      brandId: requestedBrandId || null,
      organizationId: publicMetadata.organization,
      userId: publicMetadata.user,
    } as unknown as CreateFolderDto;
  }

  public override async enrichUpdateDto(
    updateDto: Partial<UpdateFolderDto>,
    user: User,
  ): Promise<UpdateFolderDto> {
    const requestedBrandId = updateDto.brand?.toString();
    const currentBrandId = getPublicMetadata(user).brand?.toString();

    if (requestedBrandId && requestedBrandId !== currentBrandId) {
      ErrorResponse.notFound('Brand', requestedBrandId);
    }

    const { brand: _brand, ...folderDto } = updateDto;
    const scopedDto: Record<string, unknown> = { ...folderDto };
    if (Object.hasOwn(updateDto, 'brand')) {
      scopedDto.brandId = requestedBrandId || null;
    }

    return await Promise.resolve(scopedDto as UpdateFolderDto);
  }

  public override canUserModifyEntity(
    user: User,
    entity: FolderDocument,
  ): boolean {
    const { brand: brandId, organization: organizationId } =
      getPublicMetadata(user);
    return this.isFolderInScope(entity, organizationId, brandId);
  }

  private buildFolderScope(
    organizationId: string,
    brandId?: string,
  ): Array<Record<string, unknown>> {
    const scope: Array<Record<string, unknown>> = [
      { brandId: null, organizationId },
    ];
    if (brandId) {
      scope.push({ brandId, organizationId });
    }
    return scope;
  }

  private isFolderInScope(
    folder: FolderDocument,
    organizationId: string,
    brandId?: string,
  ): boolean {
    const folderBrandId = folder.brandId?.toString();

    return (
      folder.isDeleted !== true &&
      folder.organizationId?.toString() === organizationId &&
      (!folderBrandId || folderBrandId === brandId)
    );
  }
}
