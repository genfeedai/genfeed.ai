import { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { UpdateMetadataDto } from '@api/collections/metadata/dto/update-metadata.dto';
import {
  Metadata,
  type MetadataDocument,
} from '@api/collections/metadata/schemas/metadata.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class MetadataService extends BaseService<
  MetadataDocument,
  CreateMetadataDto,
  UpdateMetadataDto
> {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectModel(Metadata.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<MetadataDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  async remove(ingredientId: string): Promise<MetadataDocument | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      if (this.logger) {
        this.logger.debug(`${url} started`, {
          ingredientId,
        });
      }

      const metadata = await this.findOne({ ingredient: ingredientId });

      if (metadata) {
        await this.remove(metadata._id.toString());
      }

      if (this.logger) {
        this.logger.debug(`${url} completed`, { ingredientId });
      }

      return null;
    } catch (error: unknown) {
      if (this.logger) {
        this.logger.error(`${url} failed`, { error, ingredientId });
      }

      throw error;
    }
  }
}
