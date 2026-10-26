import { CreatePromptDto } from '@api/collections/prompts/dto/create-prompt.dto';
import { UpdatePromptDto } from '@api/collections/prompts/dto/update-prompt.dto';
import type { PromptDocument } from '@api/collections/prompts/schemas/prompt.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';
import type { PromptRenderTarget } from '@genfeedai/harness';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const PROMPT_SCALAR_FIELDS = [
  'action',
  'articleId',
  'blacklists',
  'brandId',
  'camera',
  'cameraMovement',
  'category',
  'duration',
  'enhanced',
  'fontFamily',
  'ingredientId',
  'isFavorite',
  'isSkipEnhancement',
  'lens',
  'lighting',
  'model',
  'mood',
  'organizationId',
  'original',
  'ratio',
  'reference',
  'renderTarget',
  'renderedPrompt',
  'resolution',
  'scene',
  'scope',
  'seed',
  'sounds',
  'speech',
  'status',
  'style',
  'subject',
  'userId',
] as const;

type PromptCreateInput = CreatePromptDto & {
  articleId?: string | null;
  ingredientId?: string | null;
  renderTarget?: PromptRenderTarget;
  renderedPrompt?: string;
};

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
    createPromptDto: PromptCreateInput,
    populate: (string | PopulateOption)[] = [],
  ): Promise<PromptDocument> {
    const tagIds = Array.from(
      new Set(
        (createPromptDto.tags ?? []).filter(
          (tagId): tagId is string =>
            typeof tagId === 'string' && tagId.length > 0,
        ),
      ),
    );

    return super.create(
      {
        ...pickDefinedFields(createPromptDto, PROMPT_SCALAR_FIELDS),
        ...(tagIds.length > 0
          ? { tags: { connect: tagIds.map((id) => ({ id })) } }
          : {}),
      } as CreatePromptDto,
      populate,
    );
  }

  findOne(
    params: Record<string, unknown>,
    populate: (string | PopulateOption)[] = [],
  ): Promise<PromptDocument | null> {
    return super.findOne(params, populate);
  }
}
