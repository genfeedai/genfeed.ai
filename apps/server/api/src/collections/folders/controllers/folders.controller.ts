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
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { User } from '@clerk/backend';
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
    super(loggerService, foldersService, FolderSerializer, Folder.name);
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
   * - If brand query param: folders without org + org folders without brand + brand folders
   * - If organization query param (no brand): folders without org + org folders
   * - Default: user folders + organization folders
   */
  public buildFindAllPipeline(
    user: User,
    query: BaseQueryDto,
  ): Record<string, unknown>[] {
    const publicMetadata = getPublicMetadata(user);
    const organizationId = publicMetadata.organization;

    // Check if brand or organization query params are provided
    const brandId = (query as unknown as Record<string, string | undefined>)
      .brand
      ? (query as unknown as Record<string, string | undefined>).brand
      : null;
    const queryOrganizationId = (
      query as unknown as Record<string, string | undefined>
    ).organization
      ? (query as unknown as Record<string, string | undefined>).organization
      : null;

    const matchStage: unknown = {
      isDeleted: query.isDeleted ?? false,
    };

    if (brandId) {
      // Brand context: show folders without org + org folders without brand + brand folders
      matchStage.$or = [
        { organization: null }, // Folders without organization
        {
          brand: null,
          organization: queryOrganizationId || organizationId,
        }, // Organization folders without brand
        { brand: brandId }, // Brand folders
      ];
    } else if (queryOrganizationId) {
      // Organization context (no brand): show folders without org + org folders
      matchStage.$or = [
        { organization: null }, // Folders without organization
        { organization: queryOrganizationId }, // Organization folders
      ];
    } else {
      // Default: user folders + organization folders
      matchStage.$or = [
        { user: publicMetadata.user },
        { organization: organizationId },
      ];
    }

    return [
      {
        $match: matchStage,
      },
      {
        $lookup: {
          as: 'brand',
          foreignField: '_id',
          from: 'brands',
          localField: 'brand',
        },
      },
      {
        $unwind: {
          path: '$brand',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: { createdAt: -1, label: 1 },
      },
    ];
  }
}
