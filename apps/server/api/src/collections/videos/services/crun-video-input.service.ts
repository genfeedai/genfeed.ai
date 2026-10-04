import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import type { CharacterAdmission } from '@api/collections/personas/utils/character-admission.util';
import {
  type CrunVideoQuoteIntent,
  crunVideoQuoteIntentSchema,
} from '@api/collections/videos/dto/create-crun-video-quote.dto';
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
  CrunVideoQuoteControls,
} from '@genfeedai/contracts/interfaces';
import {
  normalizeCrunVideoDraft,
  projectCrunInputControls,
} from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { BadRequestException, Injectable } from '@nestjs/common';

export type CrunPreparedImageInput = CrunPreparedInput<CrunVideoQuoteIntent>;
export type CrunPreparedImageResult = CrunPreparedResult<CrunVideoQuoteIntent>;

@Injectable()
export class CrunVideoInputService {
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

  normalize(raw: unknown, user: AuthenticatedUser): CrunVideoQuoteIntent {
    return normalizeCrunQuoteIntent(crunVideoQuoteIntentSchema, raw, user);
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
    const controls: CrunVideoQuoteControls = intent.crunControls;
    if (
      intent.model === 'crun/google/veo3-1-fast-t2v' &&
      controls.duration !== 8
    )
      return unavailable('PRICING_UNAVAILABLE');
    const references = await this.resolveReferences(intent, user, brandId);
    const built = await this.builder.buildPrompt(
      intent.model,
      {
        ...intent,
        prompt: intent.text,
        modelCategory: ModelCategory.VIDEO,
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
    if (typeof built.input.prompt !== 'string') {
      throw new BadRequestException({ code: 'CRUN_INVALID_INPUT' });
    }
    const normalized = normalizeCrunVideoDraft(
      projectCrunInputControls(contract),
      {
        modelKey: intent.model,
        contractVersion: controls.contractVersion,
        prompt: built.input.prompt,
        duration: controls.duration,
        ...(references[0] ? { startFrameId: references[0] } : {}),
        ...(references[1] ? { endFrameId: references[1] } : {}),
        ...(controls.aspectRatio ? { aspectRatio: controls.aspectRatio } : {}),
        ...(controls.resolution ? { resolution: controls.resolution } : {}),
        ...(controls.negativePrompt
          ? { negativePrompt: controls.negativePrompt }
          : {}),
        ...(controls.guidanceScale !== undefined
          ? { guidanceScale: controls.guidanceScale }
          : {}),
        ...(controls.translatePrompt !== undefined
          ? { translatePrompt: controls.translatePrompt }
          : {}),
      },
      'url',
    );
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
    intent: CrunVideoQuoteIntent,
    user: AuthenticatedUser,
  ) {
    return authorizeCrunSelection(this.prisma, intent, user);
  }

  private validatePromptProvenance(
    intent: CrunVideoQuoteIntent,
    user: AuthenticatedUser,
    brandId: string,
  ) {
    return validateCrunPromptProvenance(this.prisma, intent, user, brandId);
  }

  private readReviewedContract(
    intent: CrunVideoQuoteIntent,
    user: AuthenticatedUser,
  ) {
    return readReviewedCrunContract(this.models, intent, user, {
      category: ModelCategory.VIDEO,
      mediaKind: 'video',
    });
  }

  /**
   * Character the request's frames belong to, for linking every output
   * (#6040). A character the brand can no longer use is refused.
   */
  async resolveOutputPersonaId(
    intent: CrunVideoQuoteIntent,
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<string | null> {
    const admission = await this.admitCharacters(intent, user, brandId);
    return admission.personaId;
  }

  private admitCharacters(
    intent: CrunVideoQuoteIntent,
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<CharacterAdmission> {
    return this.personas.resolveCharacterReferences({
      brandId,
      ingredientIds: [
        ...intent.references,
        ...(intent.endFrame ? [intent.endFrame] : []),
      ],
      organizationId: user.organizationId,
      path: 'video',
    });
  }

  private async resolveReferences(
    intent: CrunVideoQuoteIntent,
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
      referenceIds: [
        ...intent.references,
        ...(intent.endFrame ? [intent.endFrame] : []),
      ],
      mode: 'video-frame',
    });
    if (
      !references ||
      (intent.parentId &&
        references.find((reference) => reference.id === intent.parentId)
          ?.kind !== 'image-ingredient')
    )
      throw new BadRequestException({
        code: 'CRUN_INVALID_INPUT',
        fieldErrors: [
          {
            field: 'references',
            message:
              'A selected frame is missing, unauthorized or not an image',
          },
        ],
      });
    return references.map((reference) => reference.url);
  }

  private preparePricing(
    intent: CrunVideoQuoteIntent,
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
