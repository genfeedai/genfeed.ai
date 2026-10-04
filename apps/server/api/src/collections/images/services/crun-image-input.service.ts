import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import {
  type CrunImageQuoteIntent,
  crunImageQuoteIntentSchema,
} from '@api/collections/images/dto/create-crun-image-quote.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import type { CharacterAdmission } from '@api/collections/personas/utils/character-admission.util';
import {
  authorizeCrunSelection,
  type CrunPreparedInput,
  type CrunPreparedResult,
  normalizeCrunQuoteIntent,
  prepareCrunPricing,
  readReviewedCrunContract,
  validateCrunPromptProvenance,
} from '@api/services/integrations/crun/crun-quote-input.util';
import { resolveCrunReferences } from '@api/services/integrations/crun/crun-reference.util';
import type { CrunQuotePreparation } from '@api/services/integrations/crun/crun-task.schema';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory } from '@genfeedai/contracts';
import type {
  CrunModelInputContract,
  CrunQuoteReasonCode,
} from '@genfeedai/contracts/interfaces';
import { normalizeCrunInput } from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { BadRequestException, Injectable } from '@nestjs/common';

export type CrunPreparedImageInput = CrunPreparedInput<CrunImageQuoteIntent>;
export type CrunPreparedImageResult = CrunPreparedResult<CrunImageQuoteIntent>;

@Injectable()
export class CrunImageInputService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly models: ModelsService,
    private readonly ingredients: IngredientsService,
    private readonly assets: AssetsService,
    private readonly builder: PromptBuilderService,
    private readonly tasks: CrunTaskService,
    private readonly config: ConfigService,
    private readonly personas: PersonasService,
  ) {}

  normalize(raw: unknown, user: AuthenticatedUser): CrunImageQuoteIntent {
    return normalizeCrunQuoteIntent(crunImageQuoteIntentSchema, raw, user);
  }

  async prepare(
    raw: unknown,
    user: AuthenticatedUser,
  ): Promise<CrunPreparedImageResult> {
    const intent = this.normalize(raw, user);
    const unavailable = (
      reasonCode: CrunQuoteReasonCode,
    ): CrunPreparedImageResult => ({ isAvailable: false, reasonCode });
    if (!this.tasks.isAdmissionEnabled()) return unavailable('CRUN_DISABLED');
    const { brandId, brand } = await this.authorizeSelection(intent, user);
    const provenance = await this.validatePromptProvenance(
      intent,
      user,
      brandId,
    );
    if (provenance) return unavailable(provenance);
    const selected = await this.readReviewedContract(intent, user);
    if (!selected.isAvailable) return selected;
    const { model, contract } = selected;
    const references = await this.resolveReferences(intent, user, brandId);
    const built = await this.builder.buildPrompt(
      intent.model,
      {
        ...intent,
        prompt: intent.text,
        modelCategory: ModelCategory.IMAGE,
        brand: {
          label: brand.label,
          description: brand.description ?? undefined,
          text: brand.text ?? undefined,
          primaryColor: brand.primaryColor ?? undefined,
          secondaryColor: brand.secondaryColor ?? undefined,
        },
        branding: buildPromptBrandingFromBrand(brand),
      },
      user.organizationId,
    );
    const normalized = normalizeCrunInput(contract, {
      prompt: built.input.prompt,
      ...(references.length ? { img_urls: references } : {}),
      ...(intent.crunControls.aspectRatio
        ? { aspect_ratio: intent.crunControls.aspectRatio }
        : {}),
      ...(intent.crunControls.resolution
        ? { resolution: intent.crunControls.resolution }
        : {}),
      ...(intent.crunControls.outputFormat
        ? { output_format: intent.crunControls.outputFormat }
        : {}),
    });
    if (!normalized.isValid)
      throw new BadRequestException({
        code: 'CRUN_INVALID_INPUT',
        fieldErrors: normalized.errors,
      });
    return this.preparePricing(
      intent,
      user,
      brandId,
      contract,
      model.id,
      normalized.input,
      built,
    );
  }

  private authorizeSelection(
    intent: CrunImageQuoteIntent,
    user: AuthenticatedUser,
  ) {
    return authorizeCrunSelection(this.prisma, intent, user);
  }

  private validatePromptProvenance(
    intent: CrunImageQuoteIntent,
    user: AuthenticatedUser,
    brandId: string,
  ) {
    return validateCrunPromptProvenance(this.prisma, intent, user, brandId);
  }

  private readReviewedContract(
    intent: CrunImageQuoteIntent,
    user: AuthenticatedUser,
  ) {
    return readReviewedCrunContract(this.models, intent, user, {
      category: ModelCategory.IMAGE,
      mediaKind: 'image',
    });
  }

  /**
   * Character the request's references belong to, for linking every output
   * (#6040). A character the brand can no longer use is refused.
   */
  async resolveOutputPersonaId(
    intent: CrunImageQuoteIntent,
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<string | null> {
    const admission = await this.admitCharacters(intent, user, brandId);
    return admission.personaId;
  }

  private admitCharacters(
    intent: CrunImageQuoteIntent,
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<CharacterAdmission> {
    return this.personas.resolveCharacterReferences({
      brandId,
      ingredientIds: intent.references,
      organizationId: user.organizationId,
      path: 'image',
    });
  }

  private async resolveReferences(
    intent: CrunImageQuoteIntent,
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<string[]> {
    await this.admitCharacters(intent, user, brandId);
    const references = await resolveCrunReferences({
      prisma: this.prisma,
      assets: this.assets,
      ingredients: this.ingredients,
      config: this.config,
      userId: user.userId,
      organizationId: user.organizationId,
      brandId,
      referenceIds: intent.references,
      mode: 'image',
    });
    if (!references)
      throw new BadRequestException({
        code: 'CRUN_INVALID_INPUT',
        fieldErrors: [
          {
            field: 'references',
            message: 'A selected reference is missing or unauthorized',
          },
        ],
      });
    for (const resolved of references) {
      const referenceId = resolved.id;
      if (intent.model === 'crun/bytedance/seedream-4-5') {
        if (resolved.kind !== 'image-ingredient')
          throw new BadRequestException({ code: 'CRUN_INVALID_INPUT' });
        const reference = await this.prisma.ingredient.findFirst({
          where: {
            id: referenceId,
            organizationId: user.organizationId,
            isDeleted: false,
            category: 'IMAGE',
          },
          select: {
            metadata: {
              select: {
                width: true,
                height: true,
                size: true,
                extension: true,
                isDeleted: true,
              },
            },
          },
        });
        const metadata = reference?.metadata;
        // Required stored-media validation; no provider call can discover or repair missing facts.
        if (
          !metadata ||
          metadata.isDeleted ||
          !Number.isInteger(metadata.width) ||
          !Number.isInteger(metadata.height) ||
          !Number.isInteger(metadata.size) ||
          metadata.size <= 0 ||
          metadata.width <= 14 ||
          metadata.height <= 14 ||
          metadata.size > 10 * 1024 * 1024 ||
          !['jpeg', 'jpg', 'png', 'webp', 'bmp', 'tiff', 'gif'].includes(
            metadata.extension.toLowerCase(),
          )
        )
          throw new BadRequestException({
            code: 'CRUN_INVALID_INPUT',
            fieldErrors: [
              {
                field: 'references',
                message:
                  'Selected reference does not meet the reviewed media limits',
              },
            ],
          });
      }
    }
    return references.map((reference) => reference.url);
  }

  private preparePricing(
    intent: CrunImageQuoteIntent,
    user: AuthenticatedUser,
    brandId: string,
    contract: CrunModelInputContract,
    modelId: string,
    normalizedInput: CrunQuotePreparation['request']['input'],
    built: Awaited<ReturnType<PromptBuilderService['buildPrompt']>>,
  ): Promise<CrunPreparedImageResult> {
    return prepareCrunPricing(
      {
        config: this.config,
        models: this.models,
        prisma: this.prisma,
        tasks: this.tasks,
      },
      {
        brandId,
        built,
        contract,
        intent,
        modelId,
        normalizedInput,
        user,
      },
    );
  }
}
