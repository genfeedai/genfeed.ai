import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import { UpdateFolderDto } from '@api/collections/folders/dto/update-folder.dto';
import type { FolderDocument } from '@api/collections/folders/schemas/folder.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
}
