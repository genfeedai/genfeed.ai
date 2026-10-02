import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import {
  type CrunImageQuoteIntent,
  crunImageQuoteIntentSchema,
} from '@api/collections/images/dto/create-crun-image-quote.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelsService } from '@api/collections/models/services/models.service';
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
} from '@genfeedai/contracts/interfaces';
import { normalizeCrunInput } from '@genfeedai/helpers';
import { getRuntimeMarginMultiplier } from '@genfeedai/pricing';
import { ConfigService } from '@libs/config/config.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

export interface CrunPreparedImageInput {
  intent: CrunImageQuoteIntent;
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
export class CrunImageInputService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly models: ModelsService,
    private readonly ingredients: IngredientsService,
    private readonly assets: AssetsService,
    private readonly builder: PromptBuilderService,
    private readonly tasks: CrunTaskService,
    private readonly config: ConfigService,
  ) {}

  normalize(raw: unknown, user: AuthenticatedUser): CrunImageQuoteIntent {
    const parsed = crunImageQuoteIntentSchema.safeParse(raw);
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

  private async authorizeSelection(
    intent: CrunImageQuoteIntent,
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
    intent: CrunImageQuoteIntent,
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
    intent: CrunImageQuoteIntent,
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
      model.category !== ModelCategory.IMAGE
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
      contract.mediaKind !== 'image' ||
      !contract.fields
    )
      return { isAvailable: false, reasonCode: 'CRUN_CONTRACT_UNAVAILABLE' };
    return { isAvailable: true, model, contract };
  }

  private async resolveReferences(
    intent: CrunImageQuoteIntent,
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

  private async preparePricing(
    intent: CrunImageQuoteIntent,
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
