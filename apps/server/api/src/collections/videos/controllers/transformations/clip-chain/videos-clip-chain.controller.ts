import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { VideoClipChainDto } from '@api/collections/videos/dto/video-clip-chain.dto';
import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import type { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import {
  ModelsGuard,
  ValidateModel,
} from '@api/helpers/guards/models/models.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { resolveVideoIdentityReferencePlan } from '@api/services/generation-brief';
import {
  ActivitySource,
  IngredientCategory,
  IngredientStatus,
  ModelCategory,
  WorkflowTrigger,
} from '@genfeedai/contracts';
import type {
  ClipChainIdentityIngredientIds,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { WorkflowSerializer } from '@genfeedai/serializers';
import {
  buildClipChainIdentityReferences,
  buildClipChainVideoTemplate,
  CLIP_CHAIN_VIDEO_TEMPLATE_ID,
  DEFAULT_CLIP_CHAIN_SEGMENT_COUNT,
} from '@genfeedai/workflows/engine';
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

const IDENTITY_STILL_CATEGORIES: readonly IngredientCategory[] = [
  IngredientCategory.IMAGE,
  IngredientCategory.AVATAR,
];
const IDENTITY_STILL_READY_STATUSES: readonly IngredientStatus[] = [
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
];

function uniqueIds(ids: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (ids ?? []).map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
}

function clipChainCreditsWorkflowMetadata(
  request: Request,
): Record<string, unknown> {
  const config = (request as unknown as DeferredCreditsRequest).creditsConfig;
  const reservationId = config?.reservationId?.trim();
  const reservedCredits = config?.amount;
  if (
    !reservationId ||
    reservedCredits === undefined ||
    !Number.isFinite(reservedCredits)
  ) {
    return {};
  }
  return {
    credits: {
      reservationId,
      reservedCredits,
    },
  };
}

/**
 * Identity-locked clip-chain runs (#4653). The run's character / product /
 * environment ingredient ids are preflighted against the tenant and brand
 * here — before a workflow exists and long before any credit is consumed —
 * then stored once on the workflow and attached to every segment generate.
 */
@AutoSwagger()
@Controller('videos')
export class VideosClipChainController {
  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly personasService: PersonasService,
    private readonly videoGenerationCreditsService: VideoGenerationCreditsService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  @Post('clip-chain')
  @Credits({
    description: 'Clip-chain video',
    source: ActivitySource.VIDEO_GENERATION,
  })
  @DeferCreditsUntilModelResolution()
  @ValidateModel({ category: ModelCategory.VIDEO })
  @UseGuards(SubscriptionGuard, CreditsGuard, ModelsGuard)
  @UseInterceptors(CreditsInterceptor)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createClipChain(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: VideoClipChainDto,
  ): Promise<JsonApiSingleResponse> {
    const brandId = user.brandId;
    if (!brandId) {
      throw new BadRequestException(
        'A brand is required to start an identity-locked clip-chain',
      );
    }

    const segmentPrompts = dto.segmentPrompts?.map((prompt) => prompt.trim());
    const segmentCount =
      dto.segmentCount ??
      segmentPrompts?.length ??
      DEFAULT_CLIP_CHAIN_SEGMENT_COUNT;
    if (segmentPrompts && segmentPrompts.length !== segmentCount) {
      throw new BadRequestException(
        'segmentPrompts must provide exactly one prompt per segment',
      );
    }

    const identity = await this.preflightIdentity(
      dto,
      user.organizationId,
      brandId,
    );
    // Fail closed at creation when the selected model has no way to carry
    // identity stills, instead of discovering it on the first paid segment.
    try {
      resolveVideoIdentityReferencePlan({
        identityReferences: buildClipChainIdentityReferences(identity),
        modelKey: dto.model,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : String(error),
      );
    }

    await this.videoGenerationCreditsService.ensureClipChainCredits(
      segmentCount,
      dto.model,
      user.organizationId,
      request,
    );

    const template = buildClipChainVideoTemplate({
      brandId,
      identity,
      identityDirective: dto.identityDirective,
      segmentCount,
      segmentPrompts,
      videoConfig: {
        aspectRatio: dto.aspectRatio,
        duration: dto.duration,
        model: dto.model,
      },
    });
    const workflowDto: CreateWorkflowDto = {
      brandId,
      description: template.description,
      edges: template.edges,
      label: dto.label?.trim() || `Clip-chain (${segmentCount} segments)`,
      metadata: {
        identity: {
          characterIngredientIds: [...identity.characterIngredientIds],
          ...(identity.productIngredientIds
            ? { productIngredientIds: [...identity.productIngredientIds] }
            : {}),
          ...(identity.environmentIngredientIds
            ? {
                environmentIngredientIds: [
                  ...identity.environmentIngredientIds,
                ],
              }
            : {}),
        },
        model: dto.model,
        segmentCount,
        templateId: CLIP_CHAIN_VIDEO_TEMPLATE_ID,
        ...clipChainCreditsWorkflowMetadata(request),
      },
      nodes: template.nodes.map((node, index) => ({
        data: { config: node.config, label: node.label },
        id: node.id,
        position: { x: index * 280, y: index % 2 === 0 ? 0 : 160 },
        type: node.type,
      })),
      trigger: WorkflowTrigger.MANUAL,
    };
    const workflow = await this.workflowsService.createWorkflow(
      user.userId ?? user.id,
      user.organizationId,
      workflowDto,
      brandId,
    );

    return serializeSingle(request, WorkflowSerializer, workflow);
  }

  private async preflightIdentity(
    dto: VideoClipChainDto,
    organizationId: string,
    brandId: string,
  ): Promise<ClipChainIdentityIngredientIds> {
    const handles = uniqueIds(dto.characterHandles);
    const resolvedHandles =
      handles.length > 0
        ? await this.personasService.resolveCharacterHandles({
            brandId,
            handles,
            organizationId,
          })
        : { resolvedIngredientIds: [], unresolvedHandles: [] };
    if (resolvedHandles.unresolvedHandles.length > 0) {
      throw new BadRequestException(
        `Unresolved character handles: ${resolvedHandles.unresolvedHandles.join(', ')}`,
      );
    }

    const identity: ClipChainIdentityIngredientIds = {
      characterIngredientIds: uniqueIds([
        ...resolvedHandles.resolvedIngredientIds,
        ...(dto.characterIngredientIds ?? []),
      ]),
      ...(dto.productIngredientIds
        ? { productIngredientIds: uniqueIds(dto.productIngredientIds) }
        : {}),
      ...(dto.environmentIngredientIds
        ? {
            environmentIngredientIds: uniqueIds(dto.environmentIngredientIds),
          }
        : {}),
    };
    if (identity.characterIngredientIds.length === 0) {
      throw new BadRequestException(
        'An identity-locked clip-chain requires at least one character ingredient id',
      );
    }

    const ids = new Set([
      ...identity.characterIngredientIds,
      ...(identity.productIngredientIds ?? []),
      ...(identity.environmentIngredientIds ?? []),
    ]);
    for (const id of ids) {
      const asset = await this.ingredientsService.findOne({
        id,
        organizationId,
        isDeleted: false,
      });
      if (
        !asset ||
        !IDENTITY_STILL_CATEGORIES.includes(
          asset.category as IngredientCategory,
        ) ||
        !IDENTITY_STILL_READY_STATUSES.includes(
          asset.status as IngredientStatus,
        )
      ) {
        throw new BadRequestException(
          `Identity ingredient ${id} is unavailable for this organization`,
        );
      }
      if (asset.brandId !== brandId) {
        throw new BadRequestException(
          `Identity ingredient ${id} does not belong to the selected brand`,
        );
      }
    }

    return identity;
  }
}
