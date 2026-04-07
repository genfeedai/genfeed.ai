import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import { UpdateFolderDto } from '@api/collections/folders/dto/update-folder.dto';
import {
  Folder,
  type FolderDocument,
} from '@api/collections/folders/schemas/folder.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class FoldersService extends BaseService<
  FolderDocument,
  CreateFolderDto,
  UpdateFolderDto
> {
  constructor(
    @InjectModel(Folder.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<FolderDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
