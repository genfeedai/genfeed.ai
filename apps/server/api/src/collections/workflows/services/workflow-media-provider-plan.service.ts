import { isFalDestination } from '@api/collections/models/utils/model-key.util';
import { findReviewedFalVideoOutputContract } from '@api/collections/models/utils/model-reviewed-fal-video-output-contract.util';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { prepareFalVideoDispatch } from '@api/collections/videos/services/providers/fal-video-generation-provider.adapter';
import { prepareSeedanceNativeOutputQuote } from '@api/collections/videos/services/seedance-native-output-quote.util';
import {
  bindSeedanceVideoReferences,
  seedanceVideoReferenceLimit,
} from '@api/collections/videos/services/seedance-reference-evidence.util';
import { measureStoredSeedanceVideoReferences } from '@api/collections/videos/services/seedance-reference-measurement.util';
import { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import type {
  WorkflowImageProviderPlan,
  WorkflowMediaProviderPlan,
  WorkflowMediaProviderPlanInput,
  WorkflowVideoProviderPlan,
} from '@api/collections/workflows/services/workflow-media-provider-plan.interface';
import { assertWorkflowExtensionSourceEvidence } from '@api/collections/workflows/utils/workflow-extension-source-evidence.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import {
  classifyInternalMediaUrl,
  internalMediaHosts,
} from '@api/helpers/utils/reference/internal-media-url.util';
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
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  IngredientCategory,
  IngredientStatus,
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

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
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
    private readonly personasService: PersonasService,
    @Optional() private readonly promptBuilderService?: PromptBuilderService,
    @Optional() private readonly filesClientService?: FilesClientService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly mediaIssuer?: AuthorizedMediaUrlService,
    @Optional() private readonly prisma?: PrismaService,
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
      `No direct media preparation contract for ${executable.type}`,
    );
  }

  /**
   * Admits the characters a node feeds into a generation (#6040, #6037): a
   * revoked character fails the node before any output or provider dispatch
   * exists. Values are the node's raw inputs: bare asset ids, asset records
   * and Library media URLs. An internal media URL must point at an asset of
   * the running organization or at the reference image of a character with an
   * active grant to it; any other internal URL is refused, so a revoked grant
   * cannot be used through a still-public URL. Returns the character to link
   * the output to.
   */
  private async admitCharacters(args: {
    brandId: string;
    organizationId: string;
    values: readonly unknown[];
  }) {
    const hosts = this.internalHosts();
    const targets: Array<{ id?: string; isInternalUrl: boolean }> = [];
    for (const value of args.values) {
      if (typeof value === 'string') {
        const url = classifyInternalMediaUrl(value, hosts);
        if (url.isInternal) {
          targets.push({ id: url.assetId, isInternalUrl: true });
          continue;
        }
      }
      const id =
        this.helper.extractIngredientId(value) ??
        (typeof value === 'string' && value && !value.includes('/')
          ? value
          : undefined);
      if (id) {
        targets.push({ id, isInternalUrl: false });
      }
    }
    const admission = await this.personasService.resolveCharacterReferences({
      brandId: args.brandId,
      ingredientIds: targets.flatMap((target) =>
        target.id ? [target.id] : [],
      ),
      organizationId: args.organizationId,
      path: 'workflow',
    });
    for (const target of targets) {
      // An internal URL whose asset cannot be resolved fails closed.
      if (
        target.isInternalUrl &&
        (!target.id ||
          (!admission.availableAvatarIds.has(target.id) &&
            !(await this.helper.hasOrganizationAsset(
              target.id,
              args.organizationId,
            ))))
      ) {
        throw new NotFoundException('Reference image');
      }
    }
    return admission;
  }

  private internalHosts(): Set<string> {
    const config = this.configService;
    return internalMediaHosts([
      config?.cdnUrl,
      config?.ingredientsEndpoint,
      config?.apiUrl,
    ]);
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
    const { personaId } = await this.admitCharacters({
      brandId,
      organizationId: context.organizationId,
      values: references ?? [],
    });
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
        personaId,
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
    const brandId = this.helper.requireBrandId(params.brandId, 'videoGen');
    if (params.sourceEvidence !== undefined) {
      if (!this.prisma || !this.filesClientService)
        throw new Error('Workflow Extend source measurement is unavailable');
      await assertWorkflowExtensionSourceEvidence(
        this.prisma,
        this.filesClientService,
        {
          organizationId: context.organizationId,
          brandId,
          parentIngredientId: params.parentIngredientId,
          sourceEvidence: params.sourceEvidence,
          frameIngredientId: params.frameIngredientId,
        },
      );
    }
    // Admit the raw inputs first: later steps replace bare ids with synthetic
    // names that no character could match.
    const identityReferences = readIdentityReferences(
      params.identityReferences,
    );
    if (isFalDestination(model) && identityReferences.length > 0) {
      throw new Error(
        'Fal workflow identity locks require a reviewed reference mapping',
      );
    }
    const { availableAvatarIds, personaId } = await this.admitCharacters({
      brandId,
      organizationId: context.organizationId,
      values: [
        ...readStrings(params.references),
        params.lastFrame,
        ...readStrings(params.videoReferences),
        ...identityReferences.map((reference) => reference.assetId),
        params.parentIngredientId,
      ],
    });
    const {
      endFrameId,
      referenceAssetIds,
      referenceReplacements,
      videoReferenceAssetIds,
    } = await this.resolveVideoReferenceInputs(params, context.organizationId);
    if (typeof params.frameIngredientId === 'string') {
      if (
        referenceAssetIds?.length !== 1 ||
        referenceAssetIds[0] !== params.frameIngredientId ||
        !this.prisma ||
        !this.filesClientService
      )
        throw new Error(
          'Fabricated extension must use its exact stored last frame',
        );
      const frame = await this.prisma.ingredient.findFirst({
        select: { s3Key: true },
        where: {
          id: params.frameIngredientId,
          organizationId: context.organizationId,
          brandId,
          parentId: String(params.parentIngredientId),
          isDeleted: false,
          category: IngredientCategory.IMAGE,
          status: {
            in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
        },
      });
      if (!frame?.s3Key)
        throw new Error('Fabricated extension last frame is unavailable');
      referenceReplacements.set(
        params.frameIngredientId,
        await this.filesClientService.getPresignedDownloadUrlForObjectKey(
          frame.s3Key,
        ),
      );
    }
    if (
      params.sourceEvidence !== undefined &&
      videoReferenceAssetIds.length === 1 &&
      this.prisma &&
      this.filesClientService
    ) {
      const source = await this.prisma.ingredient.findFirst({
        select: { s3Key: true },
        where: {
          id: videoReferenceAssetIds[0],
          organizationId: context.organizationId,
          brandId,
          isDeleted: false,
          category: IngredientCategory.VIDEO,
          status: {
            in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
        },
      });
      if (
        !source?.s3Key ||
        videoReferenceAssetIds[0] !== params.parentIngredientId
      )
        throw new Error('Native extension must use its exact stored source');
      referenceReplacements.set(
        videoReferenceAssetIds[0],
        await this.filesClientService.getPresignedDownloadUrlForObjectKey(
          source.s3Key,
        ),
      );
    }
    const prompt = typeof params.prompt === 'string' ? params.prompt : '';
    const height = typeof params.height === 'number' ? params.height : 1080;
    const width = typeof params.width === 'number' ? params.width : 1920;
    const duration =
      typeof params.duration === 'number' ? params.duration : undefined;
    const negativePrompt =
      typeof params.negativePrompt === 'string'
        ? params.negativePrompt
        : undefined;
    // Run-level identity stills (#4653). Tenancy preflight runs before the
    // brief compiles and before any output or provider dispatch exists, so
    // a deleted or foreign id fails without consuming credits.
    const identityPlan =
      identityReferences.length > 0
        ? await this.resolveIdentityReferencePlan({
            availableAvatarIds,
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
    const providerPlan = isFalDestination(model)
      ? await this.prepareFalVideoInput({
          model,
          params,
          context,
          input,
          prompt,
          duration,
          width,
          height,
          referenceAssetIds,
          videoReferenceAssetIds,
          referenceReplacements,
          endFrameId,
        })
      : {
          provider: 'replicate' as const,
          target: resolvePredictionTarget(model),
          input,
        };
    return {
      actionId: 'videoGen',
      preparationVersion: 1,
      model,
      ...providerPlan,
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
        personaId,
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

  /** Use the published provider adapter and exact reviewed schema; no funding or provider effects. */
  private async prepareFalVideoInput(args: {
    model: string;
    params: Record<string, unknown>;
    context: ExecutionContext;
    input: Record<string, unknown>;
    prompt: string;
    duration?: number;
    width: number;
    height: number;
    referenceAssetIds?: string[];
    videoReferenceAssetIds: string[];
    referenceReplacements: ReadonlyMap<string, string>;
    endFrameId?: string;
  }) {
    const prisma = this.prisma;
    if (!prisma)
      throw new Error('Reviewed Fal workflow preparation is unavailable');
    const reviewed = await findReviewedFalVideoOutputContract(
      prisma,
      args.model,
      args.context.organizationId,
    );
    if (reviewed.status !== 'reviewed')
      throw new Error(
        `Reviewed Fal workflow preparation is unresolved: ${reviewed.reason}`,
      );
    const resolve = (assetId: string): string => {
      const url = args.referenceReplacements.get(assetId);
      if (!url) throw new Error('Fal workflow reference is unresolved');
      return url;
    };
    const images = args.referenceAssetIds?.map(resolve) ?? [];
    const measuredReferences =
      seedanceVideoReferenceLimit(reviewed.contract.endpoint) &&
      args.videoReferenceAssetIds.length
        ? await measureStoredSeedanceVideoReferences(
            {
              files: this.requireReferenceFiles(),
              findStoredVideo: (id, organizationId) =>
                prisma.ingredient.findFirst({
                  select: { s3Key: true },
                  where: {
                    id,
                    organizationId,
                    isDeleted: false,
                    category: IngredientCategory.VIDEO,
                  },
                }),
            },
            {
              endpoint: reviewed.contract.endpoint,
              organizationId: args.context.organizationId,
              assetIds: args.videoReferenceAssetIds,
            },
          )
        : undefined;
    const referenceQuoteEvidence = measuredReferences
      ? bindSeedanceVideoReferences(
          reviewed.contract.endpoint,
          args.context.organizationId,
          measuredReferences,
        )
      : undefined;
    const videos = measuredReferences
      ? measuredReferences.map((reference) => reference.url)
      : args.videoReferenceAssetIds.map(resolve);
    const promptParams: Record<string, unknown> = { ...args.input };
    for (const key of [
      'resolution',
      'aspect_ratio',
      'duration',
      'generate_audio',
      'task',
      'seed',
      'draft',
    ]) {
      if (Object.hasOwn(args.params, key)) promptParams[key] = args.params[key];
    }
    if (images.length) {
      promptParams.image_url = images[0];
      promptParams.image_urls = images;
    }
    if (videos.length) promptParams.video_urls = videos;
    if (args.endFrameId) promptParams.end_image_url = resolve(args.endFrameId);
    const preparedFalDispatch = prepareFalVideoDispatch({
      model: args.model,
      modelProvider: 'fal',
      modelEndpoint: reviewed.contract.endpoint,
      modelInputSchema: reviewed.inputSchema,
      modelSchemaFamily: reviewed.schemaFamily,
      organizationId: args.context.organizationId,
      prompt:
        typeof args.input.prompt === 'string' ? args.input.prompt : args.prompt,
      promptParams,
      duration: args.duration,
      width: args.width,
      height: args.height,
      imageUrl: images[0],
    });
    if (preparedFalDispatch.endpoint !== reviewed.contract.endpoint)
      throw new Error('Fal workflow dispatch changed its reviewed endpoint');
    for (const [field, values] of [
      ['image_urls', images],
      ['video_urls', videos],
    ] as const) {
      if (
        values.length > 0 &&
        field === 'video_urls' &&
        JSON.stringify(preparedFalDispatch.input[field]) !==
          JSON.stringify(values)
      )
        throw new Error('Fal workflow cannot honor its video references');
      if (
        values.length > 1 &&
        field === 'image_urls' &&
        JSON.stringify(preparedFalDispatch.input[field]) !==
          JSON.stringify(values)
      )
        throw new Error('Fal workflow cannot honor its image references');
    }
    if (
      args.endFrameId &&
      preparedFalDispatch.input.end_image_url !== resolve(args.endFrameId)
    )
      throw new Error('Fal workflow cannot honor its last frame');
    if (
      images.length === 1 &&
      preparedFalDispatch.input.image_url !== images[0] &&
      JSON.stringify(preparedFalDispatch.input.image_urls) !==
        JSON.stringify(images)
    ) {
      throw new Error('Fal workflow cannot honor its first frame');
    }
    return {
      provider: 'fal' as const,
      target: { endpoint: preparedFalDispatch.endpoint },
      input: preparedFalDispatch.input,
      preparedFalDispatch,
      reviewedOutput: reviewed.contract,
      schemaPreparation: {
        kind: 'reviewed-provider-schema' as const,
        modelKey: args.model,
        mediaKind: 'video' as const,
        schemaVersion: reviewed.contract.version,
        schemaFamily: reviewed.schemaFamily,
        inputSchemaHash: quoteSnapshotHash(reviewed.inputSchema),
        adapterVersion: 1 as const,
      },
      nativeOutputQuoteEvidence: prepareSeedanceNativeOutputQuote(
        reviewed.contract.endpoint,
        preparedFalDispatch.input,
        measuredReferences ?? [],
      ),
      ...(referenceQuoteEvidence ? { referenceQuoteEvidence } : {}),
    };
  }

  private requireReferenceFiles(): FilesClientService {
    if (!this.filesClientService)
      throw new Error('Stored reference measurement is unavailable');
    return this.filesClientService;
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
    availableAvatarIds: ReadonlySet<string>;
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
      if (
        asset.brandId !== args.brandId &&
        !args.availableAvatarIds.has(reference.assetId)
      ) {
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
