import { CreatePromptDto } from '@api/collections/prompts/dto/create-prompt.dto';
import { UpdatePromptDto } from '@api/collections/prompts/dto/update-prompt.dto';
import {
  Prompt,
  type PromptDocument,
} from '@api/collections/prompts/schemas/prompt.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { QueryFilter } from 'mongoose';

@Injectable()
export class PromptsService extends BaseService<
  PromptDocument,
  CreatePromptDto,
  UpdatePromptDto
> {
  constructor(
    @InjectModel(Prompt.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<PromptDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  create(
    createPromptDto: CreatePromptDto,
    populate: (string | PopulateOption)[] = [],
  ): Promise<PromptDocument> {
    return super.create(createPromptDto, populate);
  }

  findOne(
    params: QueryFilter<PromptDocument>,
    populate: (string | PopulateOption)[] = [],
  ): Promise<PromptDocument | null> {
    return super.findOne(params, populate);
  }
}
