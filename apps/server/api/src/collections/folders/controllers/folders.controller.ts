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
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { FolderSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
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
   * - If brand query param: org folders without brand + brand folders
   * - If organization query param (no brand): org folders
   * - Default: user folders + organization folders
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

    const matchStage: Record<string, unknown> & {
      OR?: Array<Record<string, unknown>>;
    } = {
      isDeleted: query.isDeleted ?? false,
    };

    if (requestedBrandId) {
      // Brand context: show organization folders without brand + brand folders.
      matchStage.OR = [
        {
          brandId: null,
          organizationId: requestedOrganizationId || organizationId,
        }, // Organization folders without brand
        { brandId: requestedBrandId }, // Brand folders
      ];
    } else if (requestedOrganizationId) {
      // Organization context (no brand): show organization folders.
      matchStage.OR = [{ organizationId: requestedOrganizationId }];
    } else {
      // Default: user folders + organization folders
      matchStage.OR = [{ userId: publicMetadata.user }, { organizationId }];
    }

    return { where: matchStage, orderBy: { createdAt: -1, label: 1 } };
  }
}
