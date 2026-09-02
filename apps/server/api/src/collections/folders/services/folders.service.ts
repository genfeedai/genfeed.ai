import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import { UpdateFolderDto } from '@api/collections/folders/dto/update-folder.dto';
import type { FolderDocument } from '@api/collections/folders/schemas/folder.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Prisma Folder.tags is a Tag[] M2M relation. Clients still send the legacy
 * string[] shape (`tags: []` / tag ids). Passing a bare array into
 * `prisma.folder.create` throws:
 *   Argument `tags`: Expected TagUncheckedCreateNestedManyWithoutFoldersInput
 * Normalize to `connect` (or drop when empty) before the base write path.
 */
function withPrismaTagWrite(
  dto: CreateFolderDto | UpdateFolderDto,
): CreateFolderDto | UpdateFolderDto {
  if (!Object.hasOwn(dto, 'tags')) {
    return dto;
  }

  const { tags, ...rest } = dto as CreateFolderDto & { tags?: string[] };
  if (!Array.isArray(tags) || tags.length === 0) {
    return rest as CreateFolderDto | UpdateFolderDto;
  }

  return {
    ...rest,
    tags: { connect: tags.map((id) => ({ id })) },
  } as unknown as CreateFolderDto | UpdateFolderDto;
}

@Injectable()
export class FoldersService extends BaseService<
  FolderDocument,
  CreateFolderDto,
  UpdateFolderDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'folder', logger);
  }

  override async create(
    createDto: CreateFolderDto,
    populate: PopulateInput = [],
  ): Promise<FolderDocument> {
    return super.create(
      withPrismaTagWrite(createDto) as CreateFolderDto,
      populate,
    );
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateFolderDto>,
    populate: PopulateInput = [],
  ): Promise<FolderDocument> {
    return super.patch(
      id,
      withPrismaTagWrite(updateDto as UpdateFolderDto) as UpdateFolderDto,
      populate,
    );
  }
}
