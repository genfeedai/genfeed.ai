import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import type {
  WorkflowImageProviderPlan,
  WorkflowMediaProviderPlan,
  WorkflowMediaProviderPlanInput,
  WorkflowVideoProviderPlan,
} from '@api/collections/workflows/services/workflow-media-provider-plan.interface';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  resolveVideoIdentityReferencePlan,
  runImageGenerationBrief,
  runVideoGenerationBrief,
  toRedactedGenerationBriefProviderData,
  toRedactedVideoGenerationBriefProviderData,
} from '@api/services/generation-brief';
import { resolvePredictionTarget } from '@api/services/integrations/replicate/helpers/replicate-prediction-target.util';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  IngredientCategory,
  MetadataExtension,
  ModelCategory,
} from '@genfeedai/contracts';
import type { GenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type {
  ClipChainIdentityReference,
  VideoGenerationIdentityLock,
} from '@genfeedai/contracts/interfaces';
import {
  buildImageGenerationResolverRequest,
  buildVideoGenerationResolverRequest,
  type ExecutableNode,
  type ExecutionContext,
  unwrapExecutableActionNode,
} from '@genfeedai/workflows/engine';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

const IDENTITY_REFERENCE_ROLES = new Set<ClipChainIdentityReference['role']>([
  'character',
  'product',
  'subject',
]);

const IDENTITY_REFERENCE_CATEGORIES: readonly IngredientCategory[] = [
  IngredientCategory.IMAGE,
  IngredientCategory.AVATAR,
];

/**
 * An identity lock is explicit: a malformed entry fails the segment instead
 * of being dropped, so a run never silently degrades to last-frame identity.
 */
function readIdentityReferences(value: unknown): ClipChainIdentityReference[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('videoGen identityReferences must be an array');
  }
  return value.map((entry, index) => {
    const record =
      entry && typeof entry === 'object'
        ? (entry as Record<string, unknown>)
        : undefined;
    const assetId =
      typeof record?.assetId === 'string' ? record.assetId.trim() : '';
    const role = record?.role;
    if (
      assetId.length === 0 ||
      typeof role !== 'string' ||
      !IDENTITY_REFERENCE_ROLES.has(role as ClipChainIdentityReference['role'])
    ) {
      throw new Error(
        `videoGen identityReferences[${index}] must be { assetId, role: character | product | subject }`,
      );
    }
    return { assetId, role: role as ClipChainIdentityReference['role'] };
  });
}

function replaceReferenceTokens(
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === 'string') {
    return replacements.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => replaceReferenceTokens(entry, replacements));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        replaceReferenceTokens(entry, replacements),
      ]),
    );
  }
  return value;
}

@Injectable()
export class WorkflowMediaProviderPlanService {
  constructor(
    private readonly helper: WorkflowEngineExecutorHelperService,
    private readonly loggerService: LoggerService,
    @Optional() private readonly promptBuilderService?: PromptBuilderService,
    @Optional() private readonly filesClientService?: FilesClientService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly mediaIssuer?: AuthorizedMediaUrlService,
  ) {}

  get canPrepareImage(): boolean {
    return Boolean(this.promptBuilderService);
  }

  /** The same envelope and input precedence used by actual engine dispatch. */
  async prepareNode(
    node: ExecutableNode,
    inputs: ReadonlyMap<string, unknown>,
    context: ExecutionContext,
  ): Promise<WorkflowMediaProviderPlan> {
    const executable = unwrapExecutableActionNode(node);
    if (executable.type === 'imageGen') {
      const request = buildImageGenerationResolverRequest(executable, inputs);
      return this.prepareImage({ ...request, context, node: executable });
    }
    if (executable.type === 'videoGen') {
      const request = buildVideoGenerationResolverRequest(executable, inputs);
      return this.prepareVideo({ ...request, context, node: executable });
    }
    throw new Error(
      `No direct Replicate media preparation contract for ${executable.type}`,
    );
  }

  async prepareImage({
    model,
    params,
    context,
  }: WorkflowMediaProviderPlanInput): Promise<WorkflowImageProviderPlan> {
    if (!this.promptBuilderService)
      throw new Error('Workflow image prompt preparation is unavailable');
    const references = Array.isArray(params.references)
      ? params.references.filter(
          (reference): reference is string => typeof reference === 'string',
        )
      : undefined;
    const prompt = typeof params.prompt === 'string' ? params.prompt : '';
    const height = typeof params.height === 'number' ? params.height : 1080;
    const width = typeof params.width === 'number' ? params.width : 1920;
    const negativePrompt =
      typeof params.negativePrompt === 'string'
        ? params.negativePrompt
        : undefined;
    const compiled = runImageGenerationBrief({
      avoid: negativePrompt ? [negativePrompt] : undefined,
      height,
      model: model as string,
      objective: prompt,
      referenceIds: [],
      seed: typeof params.seed === 'number' ? params.seed : undefined,
      surface: 'workflow',
      visualDirection:
        typeof params.style === 'string' ? params.style : undefined,
      width,
    });
    const compiledInput = compiled.dispatch
      ? {
          ...compiled.dispatch,
          ...(references?.[0] ? { image: references[0] } : {}),
          ...(typeof params.strength === 'number'
            ? { strength: params.strength }
            : {}),
        }
      : undefined;
    const { input } = compiledInput
      ? { input: compiledInput }
      : await this.promptBuilderService.buildPrompt(
          model as string,
          {
            height,
            modelCategory: ModelCategory.IMAGE,
            negativePrompt,
            prompt,
            references,
            seed: typeof params.seed === 'number' ? params.seed : undefined,
            strength:
              typeof params.strength === 'number' ? params.strength : undefined,
            style: typeof params.style === 'string' ? params.style : undefined,
            width,
          },
          undefined,
        );
    const brandId = this.helper.requireBrandId(params.brandId, 'imageGen');
    return {
      actionId: 'imageGen',
      preparationVersion: 1,
      provider: 'replicate',
      model,
      target: resolvePredictionTarget(model),
      input,
      generationBriefEvidence: compiled.evidence,
      generationSource: compiled.generationSource,
      output: {
        brandId,
        category: IngredientCategory.IMAGE,
        extension: MetadataExtension.JPG,
        externalId: null,
        generationPrompt: prompt,
        generationSource: compiled.generationSource,
        model,
        negativePrompt,
        organizationId: context.organizationId,
        providerData: toRedactedGenerationBriefProviderData(compiled.evidence),
        userId: context.userId,
      },
    };
  }

  async prepareVideo({
    model,
    params,
    context,
    node,
  }: WorkflowMediaProviderPlanInput): Promise<WorkflowVideoProviderPlan> {
    const {
      endFrameId,
      referenceAssetIds,
      referenceReplacements,
      videoReferenceAssetIds,
    } = await this.resolveVideoReferenceInputs(params, context.organizationId);
    const prompt = typeof params.prompt === 'string' ? params.prompt : '';
    const height = typeof params.height === 'number' ? params.height : 1080;
    const width = typeof params.width === 'number' ? params.width : 1920;
    const duration =
      typeof params.duration === 'number' ? params.duration : undefined;
    const negativePrompt =
      typeof params.negativePrompt === 'string'
        ? params.negativePrompt
        : undefined;
    const brandId = this.helper.requireBrandId(params.brandId, 'videoGen');
    // Run-level identity stills (#4653). Tenancy preflight runs before the
    // brief compiles and before any output or provider dispatch exists, so
    // a deleted or foreign id fails without consuming credits.
    const identityReferences = readIdentityReferences(
      params.identityReferences,
    );
    const identityPlan =
      identityReferences.length > 0
        ? await this.resolveIdentityReferencePlan({
            brandId,
            firstFrameAssetId: referenceAssetIds?.[0],
            identityReferences,
            lastFrameAssetId: endFrameId,
            model: model as string,
            node,
            organizationId: context.organizationId,
            referenceReplacements,
          })
        : undefined;
    const briefReferences: readonly GenerationBriefReference[] | undefined =
      identityPlan?.references ??
      referenceAssetIds?.map((assetId) => ({
        assetId,
        role: 'first_frame' as const,
      }));
    const compiled = runVideoGenerationBrief({
      actionVerb:
        params.actionVerb === 'extend' ? params.actionVerb : undefined,
      avoid: negativePrompt ? [negativePrompt] : undefined,
      durationSeconds: duration,
      endFrameId: identityPlan ? identityPlan.endFrameId : endFrameId,
      height,
      model: model as string,
      objective: prompt,
      referenceIds: [],
      references: briefReferences,
      seed: typeof params.seed === 'number' ? params.seed : undefined,
      surface: 'workflow',
      videoReferenceIds: videoReferenceAssetIds,
      width,
    });
    if (identityPlan && !compiled.dispatch) {
      throw new Error(
        `Model "${String(model)}" is exempt from generation-brief compilation and cannot honor an identity lock`,
      );
    }
    const input = compiled.dispatch
      ? (replaceReferenceTokens(
          compiled.dispatch,
          referenceReplacements,
        ) as Record<string, unknown>)
      : { prompt };
    const lineageReferences = [
      ...(typeof params.parentIngredientId === 'string'
        ? [params.parentIngredientId]
        : []),
      ...(identityPlan?.identityLock.references.map(
        (reference) => reference.assetId,
      ) ?? []),
    ];
    return {
      actionId: 'videoGen',
      preparationVersion: 1,
      provider: 'replicate',
      model,
      target: resolvePredictionTarget(model),
      input,
      generationBriefEvidence: compiled.evidence,
      generationSource: compiled.generationSource,
      ...(identityPlan ? { identityLock: identityPlan.identityLock } : {}),
      output: {
        brandId,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        externalId: null,
        generationPrompt: prompt,
        generationSource: compiled.generationSource,
        model,
        organizationId: context.organizationId,
        parentIngredientId:
          typeof params.parentIngredientId === 'string'
            ? params.parentIngredientId
            : undefined,
        providerData: toRedactedVideoGenerationBriefProviderData(
          compiled.evidence,
        ),
        references:
          lineageReferences.length > 0 ? lineageReferences : undefined,
        userId: context.userId,
      },
    };
  }

  /**
   * Maps the executor's reference inputs (start frame, last frame, reference
   * videos) to brief asset ids and the provider URL each id resolves to.
   */
  private async resolveVideoReferenceInputs(
    params: Record<string, unknown>,
    organizationId: string,
  ): Promise<{
    endFrameId?: string;
    referenceAssetIds?: string[];
    referenceReplacements: Map<string, string>;
    videoReferenceAssetIds: string[];
  }> {
    const references = Array.isArray(params.references)
      ? params.references.filter(
          (reference): reference is string => typeof reference === 'string',
        )
      : undefined;
    const videoReferences = Array.isArray(params.videoReferences)
      ? params.videoReferences.filter(
          (reference): reference is string => typeof reference === 'string',
        )
      : undefined;
    const lastFrame =
      typeof params.lastFrame === 'string' ? params.lastFrame : undefined;
    const referenceReplacements = new Map<string, string>();
    const referenceAssetIds = references?.map((reference, index) => {
      const assetId =
        this.helper.extractIngredientId(reference) ??
        `workflow-image-reference-${index + 1}`;
      referenceReplacements.set(assetId, reference);
      return assetId;
    });
    const endFrameId = lastFrame
      ? (this.helper.extractIngredientId(lastFrame) ??
        'workflow-last-frame-reference')
      : undefined;
    if (endFrameId && lastFrame) {
      referenceReplacements.set(endFrameId, lastFrame);
    }
    const videoReferenceAssetIds = await Promise.all(
      (videoReferences ?? []).map(async (reference, index) => {
        const ingredientId = this.helper.extractIngredientId(reference);
        const assetId = ingredientId ?? `workflow-video-reference-${index + 1}`;
        let providerUrl = reference;
        if (
          this.configService?.isAuthorizedMediaDeliveryEnabled &&
          ingredientId
        ) {
          if (!this.mediaIssuer)
            throw new Error('Authorized media delivery is unavailable');
          const canonicalUrl = (
            await this.mediaIssuer.issueServerPublish(organizationId, [
              ingredientId,
            ])
          ).get(ingredientId);
          if (!canonicalUrl)
            throw new Error('The reference video is unavailable');
          providerUrl = canonicalUrl;
        } else if (ingredientId && this.filesClientService) {
          providerUrl = await this.filesClientService.getPresignedDownloadUrl(
            ingredientId,
            'videos',
          );
        }
        referenceReplacements.set(assetId, providerUrl);
        return assetId;
      }),
    );

    return {
      endFrameId,
      referenceAssetIds,
      referenceReplacements,
      videoReferenceAssetIds,
    };
  }

  /**
   * Preflights the run's identity stills against the tenant and brand, maps
   * each id to a provider-reachable URL, and applies the capability-profile
   * conflict rule (identity stills win over a conflicting frame role).
   */
  private async resolveIdentityReferencePlan(args: {
    brandId: string;
    firstFrameAssetId?: string;
    identityReferences: readonly ClipChainIdentityReference[];
    lastFrameAssetId?: string;
    model: string;
    node: ExecutableNode;
    organizationId: string;
    referenceReplacements: Map<string, string>;
  }): Promise<{
    endFrameId?: string;
    identityLock: VideoGenerationIdentityLock;
    references: GenerationBriefReference[];
  }> {
    for (const reference of args.identityReferences) {
      let asset: Awaited<
        ReturnType<WorkflowEngineExecutorHelperService['requireMediaAsset']>
      >;
      try {
        asset = await this.helper.requireMediaAsset(
          reference.assetId,
          args.organizationId,
          IDENTITY_REFERENCE_CATEGORIES,
        );
      } catch {
        throw new Error(
          `Identity ${reference.role} reference ${reference.assetId} is unavailable for this organization`,
        );
      }
      if (asset.brandId !== args.brandId) {
        throw new Error(
          `Identity ${reference.role} reference ${reference.assetId} does not belong to the run brand`,
        );
      }
      args.referenceReplacements.set(
        reference.assetId,
        this.helper.buildMediaIngredientUrl(asset.id, asset.category),
      );
    }

    const plan = resolveVideoIdentityReferencePlan({
      firstFrameAssetId: args.firstFrameAssetId,
      identityReferences: args.identityReferences,
      lastFrameAssetId: args.lastFrameAssetId,
      modelKey: args.model,
    });
    if (
      plan.identityLock.omittedFrameRoles.length > 0 ||
      plan.identityLock.omittedReferences.length > 0
    ) {
      this.loggerService.warn(
        'WorkflowMediaGenerationExecutorRegistrarService identity lock omitted conflicting inputs',
        {
          model: args.model,
          nodeId: args.node.id,
          omittedFrameRoles: plan.identityLock.omittedFrameRoles,
          omittedReferences: plan.identityLock.omittedReferences.map(
            (reference) => reference.assetId,
          ),
          reason: plan.identityLock.reason,
        },
      );
    }

    return plan;
  }
}
