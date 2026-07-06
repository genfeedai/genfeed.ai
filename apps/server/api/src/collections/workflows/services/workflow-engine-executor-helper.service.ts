import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
} from '@genfeedai/enums';
import type {
  ExecutableNode,
  INodeExecutor,
  NodeExecutor,
} from '@genfeedai/workflow-engine';
import { ConfigService } from '@libs/config/config.service';

export interface PendingWorkflowOutput {
  ingredientId: string;
  metadataId: string;
}

export class WorkflowEngineExecutorHelperService {
  constructor(
    private readonly configService: ConfigService,
    private readonly sharedService?: SharedService,
    private readonly metadataService?: MetadataService,
    private readonly ingredientsService?: IngredientsService,
  ) {}

  wrapEngineExecutor(executor: INodeExecutor): NodeExecutor {
    return async (node, inputs, context) => {
      const result = await executor.execute({ context, inputs, node });

      return result.data;
    };
  }

  getRequiredStringInput(inputs: Map<string, unknown>, key: string): string {
    const value = inputs.get(key);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    throw new Error(`Missing required input: ${key}`);
  }

  getOptionalStringInput(
    inputs: Map<string, unknown>,
    key: string,
  ): string | undefined {
    const value = inputs.get(key);

    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  getAspectRatioConfig(value: unknown): '9:16' | '16:9' | '1:1' {
    if (value === '16:9' || value === '1:1') {
      return value;
    }

    return '9:16';
  }

  getRequiredBrandId(node: ExecutableNode): string {
    return this.requireBrandId(
      this.readConfigString(node.config, 'brandId'),
      node.type,
    );
  }

  getVideoResultInput(inputs: Map<string, unknown>, key: string): unknown {
    if (!inputs.has(key)) {
      throw new Error(`Missing required input: ${key}`);
    }

    return inputs.get(key);
  }

  getOptionalNumberConfig(
    config: Record<string, unknown>,
    key: string,
    fallback: number,
  ): number {
    const value = config[key];
    return typeof value === 'number' ? value : fallback;
  }

  async createWorkflowOutputIngredient(args: {
    brandId: string;
    category: IngredientCategory;
    extension: MetadataExtension;
    organizationId: string;
    userId: string;
    model?: string;
    parentIngredientId?: string;
    references?: Array<string | undefined>;
    transformations?: TransformationCategory[];
    externalId?: string | null;
  }): Promise<PendingWorkflowOutput> {
    if (
      !this.sharedService ||
      !this.metadataService ||
      !this.ingredientsService
    ) {
      throw new Error(
        'Workflow output persistence dependencies are not available',
      );
    }

    const { ingredientData, metadataData } =
      await this.sharedService.saveDocumentsInternal({
        brand: args.brandId,
        category: args.category,
        extension: args.extension,
        model: args.model,
        organization: args.organizationId,
        parent: args.parentIngredientId || undefined,
        references: (args.references ?? []).filter(
          (reference): reference is string => typeof reference === 'string',
        ),
        status: IngredientStatus.PROCESSING,
        user: args.userId,
      });

    const ingredientId = ingredientData.id.toString();
    const metadataId = metadataData.id.toString();

    if (args.externalId) {
      await this.metadataService.patch(
        metadataId,
        new MetadataEntity({
          externalId: args.externalId,
        }),
      );
    }

    if (args.transformations && args.transformations.length > 0) {
      await this.ingredientsService.patch(ingredientId, {
        transformations: args.transformations,
      });
    }

    return { ingredientId, metadataId };
  }

  async createAndLinkProcessingOutput(args: {
    output: Parameters<
      WorkflowEngineExecutorHelperService['createWorkflowOutputIngredient']
    >[0];
    runProvider: (ingredientId: string) => Promise<string>;
    resultUrl: (ingredientId: string) => string;
  }): Promise<PendingWorkflowOutput> {
    if (!this.metadataService) {
      throw new Error(
        'Workflow output persistence dependencies are not available',
      );
    }

    const pendingOutput = await this.createWorkflowOutputIngredient(
      args.output,
    );
    const externalId = await args.runProvider(pendingOutput.ingredientId);

    await this.metadataService.patch(
      pendingOutput.metadataId,
      new MetadataEntity({
        externalId,
        result: args.resultUrl(pendingOutput.ingredientId),
      }),
    );

    return pendingOutput;
  }

  async patchMetadata(
    metadataId: string,
    metadata: MetadataEntity,
  ): Promise<void> {
    if (!this.metadataService) {
      throw new Error(
        'Workflow output persistence dependencies are not available',
      );
    }

    await this.metadataService.patch(metadataId, metadata);
  }

  async patchIngredient(
    ingredientId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    if (!this.ingredientsService) {
      throw new Error(
        'Workflow output persistence dependencies are not available',
      );
    }

    await this.ingredientsService.patch(ingredientId, patch);
  }

  requireBrandId(configuredBrandId: unknown, nodeType: string): string {
    if (typeof configuredBrandId === 'string' && configuredBrandId.length > 0) {
      return configuredBrandId;
    }

    throw new Error(`${nodeType} requires a brandId in node config`);
  }

  async resolveBrandIdFromInputOrFail(
    configuredBrandId: string | undefined,
    source: unknown,
    nodeType: string,
  ): Promise<string> {
    if (configuredBrandId) {
      return configuredBrandId;
    }

    const sourceIngredientId = this.extractIngredientId(source);
    if (sourceIngredientId && this.ingredientsService) {
      const sourceIngredient = await this.ingredientsService.findOne({
        _id: sourceIngredientId,
        isDeleted: false,
      });
      const sourceBrandId =
        this.getDocumentId(
          (sourceIngredient as unknown as { brand?: unknown })?.brand,
        ) ??
        (
          sourceIngredient as unknown as { brand?: { toString(): string } }
        )?.brand?.toString();

      if (sourceBrandId) {
        return sourceBrandId;
      }
    }

    throw new Error(
      `${nodeType} requires a brandId or source ingredient brand`,
    );
  }

  resolveMediaOutputCategory(mediaValue: unknown): IngredientCategory {
    const mediaUrl =
      typeof mediaValue === 'string'
        ? mediaValue
        : (this.extractMediaUrl(mediaValue) ?? '');

    if (
      mediaUrl.includes('/videos/') ||
      mediaUrl.includes('.mp4') ||
      mediaUrl.includes('.mov') ||
      mediaUrl.includes('.webm')
    ) {
      return IngredientCategory.VIDEO;
    }

    return IngredientCategory.IMAGE;
  }

  extractIngredientId(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const match = value.match(
        /\/(?:images|videos|musics|audios|avatars)\/([a-f\d]{24})(?:[/?#]|$)/i,
      );
      return match?.[1];
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.id === 'string') {
        return record.id;
      }

      for (const key of ['video', 'music']) {
        const nested = record[key];
        if (nested && typeof nested === 'object') {
          const nestedRecord = nested as Record<string, unknown>;
          if (typeof nestedRecord.id === 'string') {
            return nestedRecord.id;
          }
        }
      }
    }

    return undefined;
  }

  extractMusicIngredientId(value: unknown): string | undefined {
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.musicIngredientId === 'string') {
        return record.musicIngredientId;
      }
    }

    return undefined;
  }

  resolveConfiguredMediaInput(
    node: ExecutableNode,
    defaultCategory: 'image' | 'video',
  ): string {
    const source = this.readConfigString(node.config, 'source') ?? 'library';
    const resolvedUrl =
      this.readConfigString(node.config, 'resolvedUrl') ??
      (source === 'url'
        ? this.readConfigString(node.config, 'url')
        : this.readConfigString(node.config, 'selectedResolvedUrl'));

    if (resolvedUrl) {
      return resolvedUrl;
    }

    const itemId = this.readConfigString(node.config, 'itemId');
    if (!itemId) {
      throw new Error(`${node.type} requires a selected media URL or itemId`);
    }

    const itemCategory =
      this.readConfigString(node.config, 'itemCategory') ?? defaultCategory;

    return this.buildMediaItemUrl(itemId, itemCategory, source);
  }

  buildMusicIngredientUrl(ingredientId: string): string {
    return `${this.configService.ingredientsEndpoint}/musics/${ingredientId}`;
  }

  buildMediaIngredientUrl(
    ingredientId: string,
    category: IngredientCategory,
  ): string {
    if (category === IngredientCategory.VIDEO) {
      return this.buildVideoIngredientUrl(ingredientId);
    }

    return this.buildImageIngredientUrl(ingredientId);
  }

  buildImageIngredientUrl(ingredientId: string): string {
    return `${this.configService.ingredientsEndpoint}/images/${ingredientId}`;
  }

  buildVideoIngredientUrl(ingredientId: string): string {
    return `${this.configService.ingredientsEndpoint}/videos/${ingredientId}`;
  }

  buildLogoAssetUrl(assetId: string): string {
    return `${this.configService.ingredientsEndpoint}/logos/${assetId}`;
  }

  buildBannerAssetUrl(assetId: string): string {
    return `${this.configService.ingredientsEndpoint}/banners/${assetId}`;
  }

  buildReferenceAssetUrl(assetId: string): string {
    return `${this.configService.ingredientsEndpoint}/references/${assetId}`;
  }

  buildMediaItemUrl(
    itemId: string,
    itemCategory: string,
    source: string,
  ): string {
    if (source === 'brand-references' || itemCategory === 'reference') {
      return this.buildReferenceAssetUrl(itemId);
    }

    if (itemCategory === 'video') {
      return this.buildVideoIngredientUrl(itemId);
    }

    return this.buildImageIngredientUrl(itemId);
  }

  getRequiredJobOutputPath(result: unknown): string {
    if (result && typeof result === 'object') {
      const outputPath = (result as Record<string, unknown>).outputPath;

      if (typeof outputPath === 'string' && outputPath.length > 0) {
        return outputPath;
      }
    }

    throw new Error('Caption job completed without an outputPath');
  }

  getDocumentId(document: unknown): string | undefined {
    if (!document || typeof document !== 'object') {
      return undefined;
    }

    const id = (document as { id?: { toString(): string } | string }).id;
    if (typeof id === 'string') {
      return id;
    }

    if (id && typeof id === 'object' && 'toString' in id) {
      return id.toString();
    }

    return undefined;
  }

  extractMediaUrl(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const candidates = [
      record.mediaUrl,
      record.imageUrl,
      record.videoUrl,
      record.audioUrl,
      (record.video as Record<string, unknown> | undefined)?.videoUrl,
    ];

    return candidates.find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.length > 0,
    );
  }

  readConfigString(
    config: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const value = config?.[key];
    return typeof value === 'string' ? value : undefined;
  }

  buildPostLabel(description: string): string {
    const normalized = description.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 60) {
      return normalized;
    }

    return `${normalized.slice(0, 57).trimEnd()}...`;
  }

  buildHashtag(value: string): string {
    const normalized = value
      .trim()
      .replace(/^#/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized ? `#${normalized}` : '#trend';
  }

  extractPublishIngredientIds(media: unknown): string[] {
    if (Array.isArray(media)) {
      return media
        .flatMap((item) => this.extractPublishIngredientIds(item))
        .filter((id, index, ids) => ids.indexOf(id) === index);
    }

    if (typeof media === 'string') {
      return this.isPublishIngredientReference(media) ? [media] : [];
    }

    if (!media || typeof media !== 'object') {
      return [];
    }

    const record = media as Record<string, unknown>;
    const candidates = [
      record.id,
      record.id,
      record.ingredientId,
      record.url,
      record.src,
      record.secureUrl,
      record.videoUrl,
      record.imageUrl,
    ];

    return candidates
      .filter((candidate): candidate is string => typeof candidate === 'string')
      .filter((candidate) => this.isPublishIngredientReference(candidate));
  }

  private isEntityId(value: string): boolean {
    return /^[a-f\d]{24}$/i.test(value);
  }

  private isPublishIngredientReference(value: string): boolean {
    return this.isEntityId(value) || /^https?:\/\//i.test(value);
  }
}
