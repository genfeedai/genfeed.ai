import { CreatePromptDto } from '@api/collections/prompts/dto/create-prompt.dto';
import { UpdatePromptDto } from '@api/collections/prompts/dto/update-prompt.dto';
import type { PromptDocument } from '@api/collections/prompts/schemas/prompt.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { PopulateOption } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PromptsService extends BaseService<
  PromptDocument,
  CreatePromptDto,
  UpdatePromptDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'prompt', logger);
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
