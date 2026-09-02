import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import { UpdateFolderDto } from '@api/collections/folders/dto/update-folder.dto';
import { type FolderDocument } from '@api/collections/folders/schemas/folder.schema';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { FolderSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
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
  /** Ancestor walks stop here; also the product's nesting ceiling. */
  private static readonly MAX_FOLDER_DEPTH = 32;

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

    const brandId = user.brandId;
    const organizationId = user.organizationId;
    const isSuperAdmin = getIsSuperAdmin(user, request);
    const folderQuery: Record<string, unknown> = {
      id: folderId,
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

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  override async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateFolderDto,
  ): Promise<JsonApiSingleResponse> {
    const parent = await this.resolveAssignableParent(createDto.parentId, user);

    // A child inherits its parent's scope: org-shared parent → org-shared child.
    const scopedDto = parent
      ? ({
          ...createDto,
          brandId: parent.brandId ?? undefined,
        } as CreateFolderDto)
      : createDto;

    return super.create(request, user, scopedDto);
  }

  @Patch(':folderId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('folderId') folderId: string,
    @Body() updateDto: UpdateFolderDto,
  ) {
    if (!Object.hasOwn(updateDto, 'parentId')) {
      return super.patch(request, user, folderId, updateDto);
    }

    const parent = await this.resolveAssignableParent(
      updateDto.parentId,
      user,
      folderId,
    );

    // A move proposes the parent's scope. `assertPatchAllowed` later permits
    // same-scope moves for members and reserves private/shared transitions for
    // platform superadmins. Moving to the root leaves the scope untouched —
    // writing `brandId: undefined` here would make `enrichUpdateDto` see the
    // key and null out the brand.
    const movedDto = parent
      ? ({
          ...updateDto,
          brandId: parent.brandId ?? undefined,
        } as UpdateFolderDto)
      : updateDto;

    return super.patch(request, user, folderId, movedDto);
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
    const organizationId = user.organizationId;

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
      (requestedBrandId && requestedBrandId !== user.brandId?.toString()) ||
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
        requestedBrandId || user.brandId,
      );
    }

    return { where: matchStage, orderBy: { createdAt: -1, label: 1 } };
  }

  public override enrichCreateDto(
    createDto: Partial<CreateFolderDto>,
    user: User,
  ): CreateFolderDto {
    const requestedBrandId = createDto.brandId?.toString();

    if (
      requestedBrandId &&
      requestedBrandId !== user.brandId?.toString() &&
      !getIsSuperAdmin(user)
    ) {
      ErrorResponse.notFound('Brand', requestedBrandId);
    }

    return {
      ...createDto,
      brandId: requestedBrandId || null,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    } as unknown as CreateFolderDto;
  }

  public override async enrichUpdateDto(
    updateDto: Partial<UpdateFolderDto>,
    user: User,
  ): Promise<UpdateFolderDto> {
    const requestedBrandId = updateDto.brandId?.toString();
    const currentBrandId = user.brandId?.toString();

    if (
      requestedBrandId &&
      requestedBrandId !== currentBrandId &&
      !getIsSuperAdmin(user)
    ) {
      ErrorResponse.notFound('Brand', requestedBrandId);
    }

    const scopedDto: Record<string, unknown> = { ...updateDto };
    if (Object.hasOwn(updateDto, 'brandId')) {
      scopedDto.brandId = requestedBrandId || null;
    }

    return await Promise.resolve(scopedDto as UpdateFolderDto);
  }

  public override canUserModifyEntity(
    user: User,
    entity: FolderDocument,
  ): boolean {
    const brandId = user.brandId;
    const organizationId = user.organizationId;
    return this.isFolderInScope(entity, organizationId, brandId);
  }

  protected override assertPatchAllowed(
    user: User,
    existing: FolderDocument,
    updateDto: Partial<UpdateFolderDto>,
  ): void {
    if (!Object.hasOwn(updateDto, 'brandId')) {
      return;
    }

    const sourceBrandId = existing.brandId?.toString() || null;
    const destinationBrandId = updateDto.brandId?.toString() || null;
    if (sourceBrandId !== destinationBrandId && !getIsSuperAdmin(user)) {
      throw new ForbiddenException({
        detail:
          'Only a platform superadmin can move a folder between brand-private and organization-shared scope',
        title: 'Forbidden',
      });
    }
  }

  /**
   * Resolve and validate the parent a folder is being filed under.
   *
   * Returns `null` for a root folder. Rejects a parent outside the caller's
   * organization or brand scope, a folder parented to itself, and any move that
   * would close a cycle — a cycle makes the sidebar tree infinite and strands
   * the whole subtree.
   */
  private async resolveAssignableParent(
    parentId: string | null | undefined,
    user: User,
    folderId?: string,
  ): Promise<FolderDocument | null> {
    if (parentId === null || parentId === undefined) {
      return null;
    }

    if (!isEntityId(parentId)) {
      ErrorResponse.notFound(this.entityName, String(parentId));
    }

    if (folderId && parentId === folderId) {
      throw new BadRequestException('A folder cannot be its own parent');
    }

    const parent = await this.foldersService.findOne({
      id: parentId,
      isDeleted: false,
      organizationId: user.organizationId,
    });

    if (
      !parent ||
      (!getIsSuperAdmin(user) &&
        !this.isFolderInScope(parent, user.organizationId, user.brandId))
    ) {
      ErrorResponse.notFound(this.entityName, parentId);
    }

    if (folderId) {
      await this.assertNoCycle(parent, folderId, user.organizationId);
    }

    return parent;
  }

  /**
   * Walk the ancestor chain from `parent` upward. Hitting `folderId` means the
   * move would close a loop. The depth cap also breaks out of a pre-existing
   * cycle rather than spinning forever.
   */
  private async assertNoCycle(
    parent: FolderDocument,
    folderId: string,
    organizationId: string,
  ): Promise<void> {
    let ancestorId = parent.parentId;
    let depth = 0;

    while (ancestorId && depth < FoldersController.MAX_FOLDER_DEPTH) {
      if (ancestorId === folderId) {
        throw new BadRequestException(
          'That move would nest the folder inside one of its own descendants',
        );
      }

      const ancestor: FolderDocument | null = await this.foldersService.findOne(
        {
          id: ancestorId,
          isDeleted: false,
          organizationId,
        },
      );

      if (!ancestor) {
        return;
      }

      ancestorId = ancestor.parentId;
      depth += 1;
    }

    if (ancestorId) {
      throw new BadRequestException(
        `Folder nesting is limited to ${FoldersController.MAX_FOLDER_DEPTH} levels`,
      );
    }
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
      Boolean(organizationId) &&
      folder.organizationId === organizationId &&
      (!folderBrandId || folderBrandId === brandId)
    );
  }
}
