import { randomUUID } from 'node:crypto';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { BrandRemixSceneSourceService } from '@api/collections/content-runs/services/brand-remix-scene-source.service';
import {
  assertOriginalNarration,
  assertScenePlan,
  assertSupportedSceneFidelity,
  sceneInputHash,
} from '@api/collections/content-runs/services/brand-remix-scene-state';
import { ByokService } from '@api/services/byok/byok.service';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { ByokProvider, ModelCategory } from '@genfeedai/contracts';
import type {
  BrandRemixRunConfig,
  BrandRemixStoryboardScene,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import {
  type BrandRemixSceneQuote,
  brandRemixSceneQuoteSchema,
  type QuoteBrandRemixScenes,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';

type SceneQuoteItem = (
  stage: BrandRemixSceneQuote['items'][number]['stage'],
  model: string,
  credits: number,
  attempt: number,
  sceneId?: string,
  isByok?: boolean,
) => void;

import {
  AVATAR_GENERATION_CREDIT_COST,
  LLM_DEFAULTS,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixSceneQuoteService {
  constructor(
    private readonly planning: BrandRemixRunPlanningService,
    private readonly source: BrandRemixSceneSourceService,
    private readonly estimate: AgentGenerationEstimateService,
    private readonly byok: ByokService,
  ) {}
  async build(
    organizationId: string,
    brandId: string,
    config: BrandRemixRunConfig,
    input: QuoteBrandRemixScenes,
  ): Promise<BrandRemixSceneQuote> {
    assertSupportedSceneFidelity(config);
    const items: BrandRemixSceneQuote['items'] = [];
    const item: SceneQuoteItem = (
      stage,
      model,
      credits,
      attempt,
      sceneId,
      isByok = false,
    ) => {
      items.push({
        key: `${sceneId ?? 'run'}-${stage}-${attempt}`,
        stage,
        model,
        credits: isByok ? 0 : credits,
        billingMode: isByok ? 'byok' : 'platform',
        attempt,
        ...(sceneId ? { sceneId } : {}),
      });
    };
    if (input.operation === 'analysis')
      await this.quoteAnalysis(organizationId, brandId, config, item);
    else
      await this.quoteSceneWork(organizationId, brandId, config, input, item);
    return brandRemixSceneQuoteSchema.parse({
      id: randomUUID(),
      revision: config.revision,
      operation: input.operation,
      sceneId: input.sceneId,
      repairStage: input.repairStage,
      inputHash: sceneInputHash(config),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      items,
      total: items.reduce((sum, line) => sum + line.credits, 0),
    });
  }
  private async quoteAnalysis(
    organizationId: string,
    brandId: string,
    config: BrandRemixRunConfig,
    item: SceneQuoteItem,
  ): Promise<void> {
    await this.source.prepare(organizationId, brandId, config);
    const analysis = config.scenePipeline?.analysis;
    if (
      analysis &&
      [analysis.transcription, analysis.rewrite].some((stage) =>
        ['claimed', 'submitted', 'uncertain'].includes(stage.state),
      )
    )
      throw new ConflictException(
        'Reconcile the previous analysis attempt before quoting another.',
      );
    if (!analysis?.transcript)
      item(
        'transcription',
        'whisper',
        1,
        (analysis?.transcription.attempt ?? 0) + 1,
      );
    item(
      'analysis',
      LLM_DEFAULTS.background,
      1,
      (analysis?.rewrite.attempt ?? 0) + 1,
    );
  }
  private async quoteSceneWork(
    organizationId: string,
    brandId: string,
    config: BrandRemixRunConfig,
    input: QuoteBrandRemixScenes,
    item: SceneQuoteItem,
  ): Promise<void> {
    if (config.scenePipeline?.analysis?.rewrite.state !== 'ready')
      throw new ConflictException(
        'Analyze the permitted source video before quoting scene generation.',
      );
    await this.source.prepare(organizationId, brandId, config);
    assertScenePlan(config);
    assertOriginalNarration(
      config.scenePipeline.analysis.transcript ?? '',
      config.concept?.storyboard
        .map((scene) => scene.narration ?? '')
        .join(' ') ?? '',
    );
    const output = config.draft.output;
    if (!('aspectRatio' in output))
      throw new ConflictException('Select a video aspect ratio.');
    const quote = await this.estimate.estimate({
      organizationId,
      category: ModelCategory.IMAGE,
      prompt: config.draft.intent.objective,
      modelKey: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2,
      aspectRatio: output.aspectRatio,
      outputs: 1,
    });
    if (
      !quote.isAvailable ||
      quote.credits === null ||
      quote.modelKey !== MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2
    )
      throw new ConflictException(
        'Nano Banana 2 is unavailable or has no valid price.',
      );
    const imageByok = await this.byok.isByokActiveForProvider(
      organizationId,
      ByokProvider.REPLICATE,
    );
    const videoByok = await this.byok.isByokActiveForProvider(
      organizationId,
      ByokProvider.HEYGEN,
    );
    const scenes = config.concept?.storyboard ?? [];
    if (
      input.operation === 'repair' &&
      !scenes.some((scene) => scene.id === input.sceneId)
    )
      throw new ConflictException('The repair scene is unavailable.');
    for (const scene of scenes) {
      if (input.operation === 'repair' && scene.id !== input.sceneId) continue;
      await this.quoteOneScene(
        organizationId,
        brandId,
        config,
        input,
        scene,
        quote.credits,
        imageByok,
        videoByok,
        item,
      );
    }
    item(
      'captions',
      'whisper',
      1,
      (config.scenePipeline?.assembly?.transcription.attempt ?? 0) + 1,
    );
    item('assembly', 'ffmpeg', 0, 1);
  }
  private async quoteOneScene(
    organizationId: string,
    brandId: string,
    config: BrandRemixRunConfig,
    input: QuoteBrandRemixScenes,
    scene: BrandRemixStoryboardScene,
    imageCredits: number,
    imageByok: boolean,
    videoByok: boolean,
    item: SceneQuoteItem,
  ): Promise<void> {
    const identity = scene.identity ?? config.draft.identity;
    if (
      config.scenePipeline?.analysis?.requiresExplicitSceneIdentity &&
      !scene.identity
    )
      throw new ConflictException(
        'Assign an explicit avatar and voice to every scene with ambiguous speakers.',
      );
    const forbidden = [
      config.analysisSource?.assetId,
      config.sourceSnapshot.media?.status === 'saved'
        ? config.sourceSnapshot.media.assetId
        : undefined,
    ];
    if (
      config.draft.references.some((reference) =>
        forbidden.includes(reference.assetId),
      ) ||
      ('avatarAssetId' in identity &&
        forbidden.includes(identity.avatarAssetId))
    )
      throw new ConflictException(
        'Analysis assets cannot be generation references.',
      );
    await this.planning.assertDraftAssetsAuthorized(organizationId, brandId, {
      ...config.draft,
      identity,
    });
    if (
      config.draft.references.some((reference) =>
        ['first_frame', 'last_frame', 'reference_video'].includes(
          reference.role,
        ),
      )
    )
      throw new ConflictException(
        'Scene stills require supported image reference roles.',
      );
    const saved = scene.id ? config.scenePipeline?.scenes[scene.id] : undefined;
    if (
      saved &&
      [saved.image, saved.video].some((stage) =>
        ['claimed', 'submitted', 'uncertain'].includes(stage.state),
      )
    )
      throw new ConflictException(
        'Reconcile accepted scene work before a new paid attempt.',
      );
    const repairImage =
      input.operation === 'repair' &&
      (input.repairStage === 'image' || saved?.image.state !== 'ready');
    const imageNeeded = repairImage || saved?.image.state !== 'ready';
    if (imageNeeded)
      item(
        'image',
        MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2,
        imageCredits,
        (saved?.image.attempt ?? 0) + 1,
        scene.id,
        imageByok,
      );
    if (
      imageNeeded ||
      input.operation === 'repair' ||
      saved?.video.state !== 'ready'
    )
      item(
        'video',
        MODEL_KEYS.HEYGEN_AVATAR,
        AVATAR_GENERATION_CREDIT_COST,
        (saved?.video.attempt ?? 0) + 1,
        scene.id,
        videoByok,
      );
  }
}
