import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import {
  type CrunVideoQuoteIntent,
  crunVideoQuoteIntentSchema,
} from '@api/collections/videos/dto/create-crun-video-quote.dto';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
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
import { getRuntimeMarginMultiplier } from '@genfeedai/pricing';
import { ConfigService } from '@libs/config/config.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

export interface CrunPreparedImageInput {
  intent: CrunVideoQuoteIntent;
  intentHash: string;
  brandId: string;
  preparation: CrunQuotePreparation;
  templateUsed?: string;
  templateVersion?: number;
}
export type CrunPreparedImageResult =
  | { isAvailable: true; data: CrunPreparedImageInput }
  | { isAvailable: false; reasonCode: CrunQuoteReasonCode };

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
  ) {}

  normalize(raw: unknown, user: AuthenticatedUser): CrunVideoQuoteIntent {
    const parsed = crunVideoQuoteIntentSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'CRUN_INVALID_INPUT',
        fieldErrors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    return { ...parsed.data, brandId: parsed.data.brandId ?? user.brandId };
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

  private async authorizeSelection(
    intent: CrunVideoQuoteIntent,
    user: AuthenticatedUser,
  ) {
    const brandId = intent.brandId;
    if (!brandId) throw new BadRequestException({ code: 'CRUN_INVALID_INPUT' });
    const brand = await this.prisma.brand.findFirst({
      where: {
        id: brandId,
        organizationId: user.organizationId,
        isDeleted: false,
      },
    });
    if (!brand) throw new ForbiddenException('Selected brand is unavailable');
    if (
      intent.folderId &&
      !(await this.prisma.folder.findFirst({
        where: {
          id: intent.folderId,
          organizationId: user.organizationId,
          brandId,
          isDeleted: false,
        },
        select: { id: true },
      }))
    )
      throw new ForbiddenException('Selected folder is unavailable');
    return { brandId, brand };
  }

  private async validatePromptProvenance(
    intent: CrunVideoQuoteIntent,
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<CrunQuoteReasonCode | null> {
    if (
      intent.harness ||
      intent.requestedSkillSlugs.length ||
      (intent.knowledge &&
        ((intent.knowledge.sourceIds?.length ?? 0) ||
          (intent.knowledge.spaceIds?.length ?? 0) ||
          (intent.knowledge.purposes?.length ?? 0)))
    )
      return 'CRUN_ENHANCEMENT_REQUIRED';
    if (intent.promptId) {
      const prompt = await this.prisma.prompt.findFirst({
        where: {
          id: intent.promptId,
          organizationId: user.organizationId,
          userId: user.userId,
          brandId,
          isDeleted: false,
        },
        select: { enhanced: true },
      });
      if (!prompt?.enhanced?.trim() || prompt.enhanced.trim() !== intent.text)
        return 'CRUN_ENHANCEMENT_REQUIRED';
    }
    return null;
  }

  private async readReviewedContract(
    intent: CrunVideoQuoteIntent,
    user: AuthenticatedUser,
  ): Promise<
    | {
        isAvailable: true;
        model: NonNullable<Awaited<ReturnType<ModelsService['findOne']>>>;
        contract: CrunModelInputContract;
      }
    | { isAvailable: false; reasonCode: CrunQuoteReasonCode }
  > {
    const model = await this.models.findOne({
      key: intent.model,
      organizationId: user.organizationId,
    });
    if (
      model?.provider !== 'crun' ||
      !model.isActive ||
      model.isDeleted ||
      model.category !== ModelCategory.VIDEO
    )
      return { isAvailable: false, reasonCode: 'CRUN_MODEL_UNAVAILABLE' };
    if (
      model.pendingProviderContractVersion ||
      !model.reviewedProviderContractVersion ||
      intent.crunControls.contractVersion !==
        model.reviewedProviderContractVersion
    )
      return { isAvailable: false, reasonCode: 'CRUN_CONTRACT_UNAVAILABLE' };
    const rawContract = model.providerInputSchema;
    if (
      !rawContract ||
      typeof rawContract !== 'object' ||
      Array.isArray(rawContract)
    )
      return { isAvailable: false, reasonCode: 'CRUN_CONTRACT_UNAVAILABLE' };
    const contract = rawContract as unknown as CrunModelInputContract;
    if (
      contract.version !== model.reviewedProviderContractVersion ||
      contract.endpoint !== intent.model.slice(5) ||
      contract.mediaKind !== 'video' ||
      !contract.fields
    )
      return { isAvailable: false, reasonCode: 'CRUN_CONTRACT_UNAVAILABLE' };
    return { isAvailable: true, model, contract };
  }

  private async resolveReferences(
    intent: CrunVideoQuoteIntent,
    user: AuthenticatedUser,
    brandId: string,
  ): Promise<string[]> {
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

  private async preparePricing(
    intent: CrunVideoQuoteIntent,
    user: AuthenticatedUser,
    brandId: string,
    contract: CrunModelInputContract,
    modelId: string,
    normalizedInput: CrunQuotePreparation['request']['input'],
    built: Awaited<ReturnType<PromptBuilderService['buildPrompt']>>,
  ): Promise<CrunPreparedImageResult> {
    const unavailable = (
      reasonCode: CrunQuoteReasonCode,
    ): CrunPreparedImageResult => ({ isAvailable: false, reasonCode });
    const reviewed = await this.prisma.modelProviderContract.findFirst({
      where: {
        modelId,
        provider: 'crun',
        endpoint: contract.endpoint,
        version: contract.version,
        reviewStatus: 'approved',
      },
      select: { pricing: true },
    });
    if (!reviewed) return unavailable('CRUN_CONTRACT_UNAVAILABLE');
    const profile = await this.models.findBillablePricingProfile(
      intent.model,
      user.organizationId,
    );
    if (!profile) return unavailable('PRICING_UNAVAILABLE');
    let credential: CrunQuotePreparation['credential'];
    try {
      credential = await this.tasks.resolveCredential(user.organizationId);
    } catch {
      return unavailable('CRUN_CREDENTIALS_UNAVAILABLE');
    }
    const creditsPerUsd = this.config.get('CRUN_CREDITS_PER_USD');
    const rateVersion = this.config.get('CRUN_RATE_VERSION');
    return {
      isAvailable: true,
      data: {
        intent,
        brandId,
        intentHash: quoteSnapshotHash(intent),
        templateUsed: built.templateUsed,
        templateVersion: built.templateVersion,
        preparation: {
          profile,
          contract,
          pricingEvidence: reviewed?.pricing,
          request: { model: contract.endpoint, input: normalizedInput },
          credential,
          outputs: intent.outputs,
          creditsPerUsd:
            typeof creditsPerUsd === 'string' ? creditsPerUsd : null,
          acquisitionRateVersion:
            typeof rateVersion === 'string' ? rateVersion : null,
          marginMultiplier: getRuntimeMarginMultiplier(),
        },
      },
    };
  }
}
