import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import {
  admitBreakoutGenerationContinuation,
  type BreakoutGenerationAdmission,
  runWithBreakoutGenerationAdmission,
} from '@api/collections/outliers/services/breakout-generation-admission.util';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import {
  AGENT_GENERATION_GATEWAY,
  type IAgentGenerationGateway,
} from '@api/services/agent-orchestrator/gateway/agent-generation-gateway.interface';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { BrandIdentitySnapshotService } from '@api/services/branded-generation-receipts/brand-identity-snapshot.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { IngredientCategory, IngredientStatus } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';

type ImageSettings = Pick<
  CreateImageDto,
  | 'model'
  | 'aspectRatio'
  | 'width'
  | 'height'
  | 'resolution'
  | 'quality'
  | 'references'
  | 'requestedSkillSlugs'
>;
type VideoSettings = Pick<
  CreateVideoDto,
  | 'model'
  | 'width'
  | 'height'
  | 'duration'
  | 'references'
  | 'requestedSkillSlugs'
>;
/** Private server preparation; media identity/credit/provider receipts cannot be supplied as settings. */
export type BreakoutMediaOutputGenerationRequest = {
  admission: Readonly<BreakoutGenerationAdmission>;
  prompts: readonly string[];
  settings: ImageSettings | VideoSettings;
  provider: string;
};
export type BreakoutMediaOutputGenerationResult = {
  state: 'ready' | 'processing' | 'reconciliation_required';
  ingredientIds: string[];
};

/** Uses the normal media endpoints, prices, provider identities and completion recovery. Never publishes. */
@Injectable()
export class BreakoutMediaOutputGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AGENT_GENERATION_GATEWAY)
    private readonly gateway: IAgentGenerationGateway,
    private readonly snapshots: BrandIdentitySnapshotService,
    private readonly brandValidation: BrandValidationService,
  ) {}

  async generate(
    request: Readonly<BreakoutMediaOutputGenerationRequest>,
  ): Promise<BreakoutMediaOutputGenerationResult> {
    const { admission, prompts, settings, provider } = request;
    const model = settings.model;
    const { scope } = admission;
    const image = scope.format === 'image' || scope.format === 'carousel';
    const video = scope.format === 'video' || scope.format === 'short';
    if (
      (!image && !video) ||
      !provider.trim() ||
      !model?.trim() ||
      prompts.some((prompt) => !prompt.trim()) ||
      prompts.length < (scope.format === 'carousel' ? 2 : 1) ||
      prompts.length > (scope.format === 'carousel' ? 8 : 1)
    )
      throw new BadRequestException('breakout_media_request_invalid');
    await admission.reauthorize(this.prisma);
    const snapshot = await this.snapshots.preview({
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      actorId: admission.actorUserId,
    });
    await admission.reauthorize(this.prisma);
    const preflight = this.brandValidation.preflightBrandCapabilities({
      snapshot,
      provider,
      model,
      mediaKind: image ? 'image' : 'video',
    });
    if (preflight.status === 'blocked') {
      // Record the actual preflight outcome without replacing an already dispatched attempt.
      await this.prisma.$transaction(async (tx) => {
        await admission.reauthorize(tx);
        await tx.breakoutResponseOutput.updateMany({
          where: {
            id: admission.outputId,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            credentialId: admission.credentialId,
            responseId: admission.responseId,
            workflowExecutionId: admission.workflowExecutionId,
            format: scope.format,
            isDeleted: false,
            state: 'reserved',
          },
          data: { heldReason: 'media_brand_capability_unavailable' },
        });
        await admission.reauthorize(tx);
      });
      throw new ConflictException(
        'breakout_media_brand_capability_unavailable',
      );
    }
    const category = image
      ? IngredientCategory.IMAGE
      : IngredientCategory.VIDEO;
    const claim = await this.claimOutput(admission);
    if (claim.won)
      await this.dispatchComponents(request, model, claim.generationKey);
    return this.readRetained(
      admission,
      category,
      claim.generationKey,
      prompts.length,
    );
  }

  private async claimOutput(admission: Readonly<BreakoutGenerationAdmission>) {
    const { scope } = admission;
    // Exactly one caller owns the entire immutable output. A retry never dispatches missing components;
    // an interruption remains held until actual provider/placeholder reconciliation proves its outcome.
    return this.prisma.$transaction(async (tx) => {
      await admission.reauthorize(tx);
      const where = {
        id: admission.outputId,
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        credentialId: admission.credentialId,
        responseId: admission.responseId,
        isDeleted: false,
        workflowExecutionId: admission.workflowExecutionId,
        format: scope.format,
      };
      const output = await tx.breakoutResponseOutput.findFirst({
        where,
        select: { generationKey: true, state: true },
      });
      await admission.reauthorize(tx);
      if (!output)
        throw new ConflictException('breakout_media_output_unavailable');
      const first = {
        ...admission,
        componentKey: `${output.generationKey}:media:1`,
      };
      await admitBreakoutGenerationContinuation(tx, first);
      await admission.reauthorize(tx);
      const changed = await tx.breakoutResponseOutput.updateMany({
        where: scopedWhere(scope.organizationId, {
          ...where,
          state: 'reserved',
        }),
        data: { state: 'generating', heldReason: null },
      });
      if (!changed.count) {
        await admission.reauthorize(tx);
        const retained = await tx.breakoutResponseOutput.findFirst({
          where,
          select: { generationKey: true, state: true },
        });
        await admission.reauthorize(tx);
        if (
          retained?.state !== 'generating' ||
          retained.generationKey !== output.generationKey
        )
          throw new ConflictException('breakout_media_output_not_dispatchable');
      }
      await admission.reauthorize(tx);
      return { generationKey: output.generationKey, won: changed.count === 1 };
    });
  }

  private async dispatchComponents(
    request: Readonly<BreakoutMediaOutputGenerationRequest>,
    model: string,
    generationKey: string,
  ): Promise<void> {
    const { admission, prompts, settings } = request;
    const { scope } = admission;
    const image = scope.format === 'image' || scope.format === 'carousel';
    const category = image
      ? IngredientCategory.IMAGE
      : IngredientCategory.VIDEO;
    for (const [index, prompt] of prompts.entries()) {
      const component = {
        ...admission,
        componentKey: `${generationKey}:media:${index + 1}`,
      };
      await this.prisma.$transaction((tx) =>
        admitBreakoutGenerationContinuation(tx, component),
      );
      await runWithBreakoutGenerationAdmission(
        this.prisma,
        component,
        async () => {
          await admission.reauthorize(this.prisma);
          // Explicit allowlist keeps caller/provider receipts, prices, lineage and account fields out of DTOs.
          const body = {
            model,
            aspectRatio:
              'aspectRatio' in settings ? settings.aspectRatio : undefined,
            width: settings.width,
            height: settings.height,
            references: settings.references,
            requestedSkillSlugs: settings.requestedSkillSlugs,
            ...(image
              ? {
                  resolution:
                    'resolution' in settings ? settings.resolution : undefined,
                  quality: 'quality' in settings ? settings.quality : undefined,
                  outputs: 1,
                  waitForCompletion: true,
                }
              : {
                  duration:
                    'duration' in settings ? settings.duration : undefined,
                }),
            text: prompt,
            sourceActionId: component.componentKey,
            brandId: scope.brandId,
          };
          const input = {
            body,
            originalPrompt: prompt,
            principal: {
              organizationId: scope.organizationId,
              brandId: scope.brandId,
              userId: admission.actorUserId,
            },
            onPlaceholderCreated: async (ingredientId: string) => {
              await this.prisma.$transaction(async (tx) => {
                await admitBreakoutGenerationContinuation(tx, component);
                const updated = await tx.ingredient.updateMany({
                  where: {
                    id: ingredientId,
                    organizationId: scope.organizationId,
                    brandId: scope.brandId,
                    userId: admission.actorUserId,
                    category,
                    sourceActionId: component.componentKey,
                    isDeleted: false,
                    status: IngredientStatus.PROCESSING,
                  },
                  data: {
                    workflowExecutionId: admission.workflowExecutionId,
                    agentStrategyId: scope.strategyId,
                    groupId: generationKey,
                    groupIndex: index,
                  },
                });
                if (updated.count !== 1)
                  throw new ConflictException(
                    'breakout_media_placeholder_changed',
                  );
                await admission.reauthorize(tx);
              });
            },
          };
          if (image) await this.gateway.generateImage(input);
          else await this.gateway.generateVideo(input);
          await admission.reauthorize(this.prisma);
        },
      );
    }
  }

  private async readRetained(
    admission: Readonly<BreakoutGenerationAdmission>,
    category: IngredientCategory,
    generationKey: string,
    expectedParts: number,
  ): Promise<BreakoutMediaOutputGenerationResult> {
    const { scope } = admission;
    await admission.reauthorize(this.prisma);
    const retained = await this.prisma.ingredient.findMany({
      where: {
        organizationId: scope.organizationId,
        brandId: scope.brandId,
        userId: admission.actorUserId,
        workflowExecutionId: admission.workflowExecutionId,
        agentStrategyId: scope.strategyId,
        groupId: generationKey,
        category,
        isDeleted: false,
      },
      orderBy: [{ groupIndex: 'asc' }, { id: 'asc' }],
      take: 9,
      select: {
        id: true,
        groupIndex: true,
        sourceActionId: true,
        status: true,
        s3Key: true,
        version: true,
      },
    });
    await admission.reauthorize(this.prisma);
    const ids = retained.map((item) => item.id);
    if (
      retained.length !== expectedParts ||
      retained.some(
        (item, index) =>
          item.groupIndex !== index ||
          item.sourceActionId !== `${generationKey}:media:${index + 1}`,
      )
    )
      return { state: 'reconciliation_required', ingredientIds: ids };
    if (
      retained.every(
        (item) =>
          (item.status === IngredientStatus.GENERATED ||
            item.status === IngredientStatus.VALIDATED) &&
          Boolean(item.s3Key) &&
          item.version >= 1,
      )
    )
      return { state: 'ready', ingredientIds: ids };
    if (
      retained.every(
        (item) =>
          item.status === IngredientStatus.PROCESSING ||
          item.status === IngredientStatus.GENERATED ||
          item.status === IngredientStatus.VALIDATED,
      )
    )
      return { state: 'processing', ingredientIds: ids };
    return { state: 'reconciliation_required', ingredientIds: ids };
  }
}
