import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { remixAvatarAspectRatio } from '@api/collections/content-runs/services/brand-remix-run-helpers';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { BrandRemixSceneBillingService } from '@api/collections/content-runs/services/brand-remix-scene-billing.service';
import {
  assertSupportedSceneFidelity,
  isStaleSceneClaim,
} from '@api/collections/content-runs/services/brand-remix-scene-state';
import { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { scopedWhere } from '@api/index';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  BrandRemixRunConfig,
  BrandRemixStoryboardScene,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type {
  BrandRemixScenePipeline,
  BrandRemixSceneQuote,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';

import type { ImageGenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  MODEL_KEYS,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import { readIngredientMediaUrl } from '@libs/media/media-url.util';
import { ConflictException, Injectable } from '@nestjs/common';

type SceneStageName = 'image' | 'video';
type SceneStage = BrandRemixScenePipeline['scenes'][string]['image'];
type SavedRemixScene = BrandRemixScenePipeline['scenes'][string];
type SceneQuoteLine = BrandRemixSceneQuote['items'][number];
type PlaceholderCreated = (assetId: string) => Promise<void>;

@Injectable()
export class BrandRemixSceneGenerationService {
  constructor(
    private readonly store: BrandRemixSceneStoreService,
    private readonly billing: BrandRemixSceneBillingService,
    private readonly planning: BrandRemixRunPlanningService,
    private readonly prisma: PrismaService,
    private readonly files: FilesClientService,
    private readonly mediaUrls: MediaUrlService,
    private readonly images: ImageGenerationService,
    private readonly avatars: AvatarVideoGenerationService,
  ) {}
  group(runId: string, sceneId: string, stage: string, attempt: number) {
    return `remix-${runId}-${sceneId}-${stage}-${attempt}`;
  }
  async asset(
    organizationId: string,
    brandId: string,
    assetId: string,
    groupId: string,
    category: 'IMAGE' | 'AVATAR',
  ) {
    const asset = await this.prisma.ingredient.findFirst({
      where: scopedWhere(organizationId, {
        id: assetId,
        brandId,
        groupId,
        category,
      }),
      include: { metadata: true },
    });
    if (!asset || asset.sourceActionId?.startsWith('remix-source:'))
      throw new ConflictException(
        'Generated scene asset is unavailable or outside this run.',
      );
    return asset;
  }
  /**
   * Advance every accepted scene as far as its inputs allow: reconcile
   * in-flight stages, then dispatch each pending still and each clip whose
   * still is ready. Scenes progress in parallel so one slow clip does not hold
   * the whole ad. `reconcileOnly` records work already accepted by a provider
   * after cancellation and never claims or dispatches.
   *
   * Resolves true once every scene has a ready clip. Throws once nothing is in
   * flight and at least one scene needs an explicit repair quote.
   */
  async step(
    organizationId: string,
    runId: string,
    operationId: string,
    options: { reconcileOnly?: boolean } = {},
  ): Promise<boolean> {
    const reconcileOnly = options.reconcileOnly === true;
    const fenced = await this.store.fence(organizationId, runId, operationId, {
      allowCancelled: reconcileOnly,
    });
    const { brandId } = fenced;
    let { config } = fenced;
    if (!reconcileOnly) assertSupportedSceneFidelity(config);
    let isComplete = true;
    let isInFlight = false;
    const failures: string[] = [];
    for (const scene of config.concept?.storyboard ?? []) {
      if (!scene.id)
        throw new ConflictException('Missing stable scene identity.');
      for (const stageName of ['image', 'video'] as const) {
        const pipeline = config.scenePipeline;
        const saved = pipeline?.scenes[scene.id];
        if (!pipeline?.operation || !pipeline.quote || !saved)
          throw new ConflictException('Missing accepted scene snapshot.');
        const stage = saved[stageName];
        if (stage.state === 'ready') continue;
        if (stage.state === 'failed') {
          isComplete = false;
          failures.push(stage.error ?? 'Scene generation failed.');
          break;
        }
        const groupId =
          stage.groupId ??
          this.group(runId, scene.id, stageName, stage.attempt);
        if (stage.state === 'pending') {
          isComplete = false;
          if (reconcileOnly) break;
          let dispatchError: unknown;
          try {
            await this.dispatchPendingStage(
              organizationId,
              runId,
              operationId,
              brandId,
              config,
              scene,
              scene.id,
              stageName,
              stage,
              saved,
              pipeline.quote,
              pipeline.operation.userId,
              groupId,
            );
          } catch (error: unknown) {
            dispatchError = error;
          }
          // A cancellation or superseding operation stops the whole step;
          // one scene's dispatch failure does not stop the others.
          ({ config } = await this.store.fence(
            organizationId,
            runId,
            operationId,
          ));
          const dispatched =
            config.scenePipeline?.scenes[scene.id]?.[stageName];
          if (dispatchError && dispatched?.state === 'failed')
            failures.push(dispatched.error ?? 'Scene dispatch failed.');
          else isInFlight = true;
          break;
        }
        const outcome = await this.reconcileSubmittedStage(
          organizationId,
          runId,
          operationId,
          brandId,
          scene.id,
          stageName,
          stage,
          saved,
          pipeline.quote,
          groupId,
          stageName === 'image' ? 'IMAGE' : 'AVATAR',
          reconcileOnly,
        );
        ({ config } = await this.store.fence(
          organizationId,
          runId,
          operationId,
          { allowCancelled: reconcileOnly },
        ));
        if (outcome === 'ready') continue;
        isComplete = false;
        if (outcome === 'failed') {
          const failed = config.scenePipeline?.scenes[scene.id]?.[stageName];
          failures.push(failed?.error ?? 'Scene generation failed.');
        } else if (outcome === 'processing' || !reconcileOnly) {
          // Undispatched stages retry their same accepted attempt next step.
          isInFlight = true;
        }
        break;
      }
    }
    if (isComplete) return true;
    if (!isInFlight && failures.length > 0 && !reconcileOnly)
      throw new ConflictException(
        `${failures.length} scene${failures.length === 1 ? '' : 's'} need repair: ${failures[0]}`,
      );
    return reconcileOnly ? !isInFlight : false;
  }
  private async reconcileSubmittedStage(
    organizationId: string,
    runId: string,
    operationId: string,
    brandId: string,
    sceneId: string,
    stageName: SceneStageName,
    stage: SceneStage,
    saved: SavedRemixScene,
    quote: BrandRemixSceneQuote,
    groupId: string,
    category: 'IMAGE' | 'AVATAR',
    reconcileOnly: boolean,
  ): Promise<'ready' | 'failed' | 'processing' | 'undispatched'> {
    // A retried attempt keeps its group; abandoned placeholders are excluded
    // so an old FAILED row never stands in for the live attempt.
    const found = await this.prisma.ingredient.findFirst({
      where: scopedWhere(organizationId, {
        brandId,
        groupId,
        category,
        ...(stage.assetId
          ? { id: stage.assetId }
          : { id: { notIn: saved.replacedAssetIds } }),
      }),
      include: { metadata: true },
      orderBy: { createdAt: 'desc' },
    });
    const acceptedLine = quote.items.find(
      (item) =>
        item.sceneId === sceneId &&
        item.stage === stageName &&
        item.attempt === stage.attempt,
    );
    const isImageHold = stageName === 'image' && Boolean(acceptedLine?.credits);
    const fail = async (error: string, assetId?: string) => {
      if (acceptedLine)
        await this.billing.release(
          organizationId,
          runId,
          operationId,
          acceptedLine,
          isImageHold,
        );
      await this.patch(organizationId, runId, operationId, sceneId, stageName, {
        state: 'failed',
        ...(assetId ? { assetId } : {}),
        error,
      });
      return 'failed' as const;
    };
    if (!found) {
      if (stage.assetId)
        return fail('Generated scene asset is unavailable. Request a repair.');
      // Placeholders persist before any provider call, so a stale claim with
      // no placeholder never reached a provider.
      if (!isStaleSceneClaim(stage)) return 'processing';
      if (reconcileOnly)
        return fail('Cancelled before this scene reached a provider.');
      await this.resetUndispatched(
        organizationId,
        runId,
        operationId,
        sceneId,
        stageName,
      );
      return 'undispatched';
    }
    if (found.sourceActionId?.startsWith('remix-source:'))
      return fail('Generated scene asset is outside this run.', found.id);
    if (found.status === 'FAILED')
      return fail(
        'Provider generation failed. Request a repair quote.',
        found.id,
      );
    if (!['GENERATED', 'VALIDATED'].includes(found.status ?? '')) {
      if (
        isStaleSceneClaim(stage) &&
        found.status === 'PROCESSING' &&
        !found.metadata?.externalId &&
        !found.metadata?.externalProvider
      ) {
        await this.prisma.ingredient.updateMany({
          where: scopedWhere(organizationId, {
            brandId,
            id: found.id,
            status: 'PROCESSING' as const,
          }),
          data: { status: 'FAILED' as const },
        });
        if (reconcileOnly)
          return fail(
            'Cancelled before this scene reached a provider.',
            found.id,
          );
        await this.resetUndispatched(
          organizationId,
          runId,
          operationId,
          sceneId,
          stageName,
          found.id,
        );
        return 'undispatched';
      }
      if (stage.assetId !== found.id)
        await this.patch(
          organizationId,
          runId,
          operationId,
          sceneId,
          stageName,
          { assetId: found.id },
        );
      return 'processing';
    }
    let actualDurationSeconds = saved.actualDurationSeconds;
    if (stageName === 'video') {
      const url =
        readIngredientMediaUrl(found) ??
        (found.s3Key ? this.mediaUrls.buildUrl(found.s3Key) : undefined);
      let probe:
        | Awaited<ReturnType<FilesClientService['probeMediaFromUrl']>>
        | undefined;
      if (url) {
        try {
          probe = await this.files.probeMediaFromUrl(url, 'video');
        } catch (error: unknown) {
          // Normal steps retry a transient probe on resume; after
          // cancellation nobody resumes, so the clip is recorded as needing
          // repair rather than blocking the run.
          if (!reconcileOnly) throw error;
        }
      }
      if (
        !probe?.durationSeconds ||
        probe.durationSeconds > 20 ||
        !probe.width ||
        !probe.height ||
        !probe.audioCodec
      ) {
        // The provider delivered a clip, so its cost is incurred.
        if (acceptedLine)
          await this.billing.settle(
            organizationId,
            runId,
            operationId,
            acceptedLine,
          );
        await this.patch(
          organizationId,
          runId,
          operationId,
          sceneId,
          stageName,
          {
            state: 'failed',
            assetId: found.id,
            error:
              'Repair required: missing speech or unsupported clip duration/dimensions.',
          },
        );
        return 'failed';
      }
      actualDurationSeconds = probe.durationSeconds;
    }
    if (acceptedLine)
      await this.billing.settle(
        organizationId,
        runId,
        operationId,
        acceptedLine,
        isImageHold,
      );
    await this.patch(
      organizationId,
      runId,
      operationId,
      sceneId,
      stageName,
      { state: 'ready', assetId: found.id },
      actualDurationSeconds,
    );
    return 'ready';
  }
  private async resetUndispatched(
    organizationId: string,
    runId: string,
    operationId: string,
    sceneId: string,
    stageName: SceneStageName,
    abandonedAssetId?: string,
  ) {
    const { config } = await this.store.fence(
      organizationId,
      runId,
      operationId,
      { allowCancelled: true },
    );
    const pipeline = config.scenePipeline;
    const scene = pipeline?.scenes[sceneId];
    if (!pipeline || !scene) throw new ConflictException('Scene was removed.');
    const stage = scene[stageName];
    await this.store.save(organizationId, runId, config, {
      ...config,
      scenePipeline: {
        ...pipeline,
        scenes: {
          ...pipeline.scenes,
          [sceneId]: {
            ...scene,
            [stageName]: {
              attempt: stage.attempt,
              state: 'pending',
              ...(stage.groupId ? { groupId: stage.groupId } : {}),
            },
            replacedAssetIds: abandonedAssetId
              ? [...scene.replacedAssetIds, abandonedAssetId]
              : scene.replacedAssetIds,
          },
        },
      },
    });
  }
  private async dispatchPendingStage(
    organizationId: string,
    runId: string,
    operationId: string,
    brandId: string,
    config: BrandRemixRunConfig,
    scene: BrandRemixStoryboardScene,
    sceneId: string,
    stageName: SceneStageName,
    stage: SceneStage,
    saved: SavedRemixScene,
    quote: BrandRemixSceneQuote,
    userId: string,
    groupId: string,
  ): Promise<void> {
    const markFailed = async (error: unknown) =>
      this.patch(organizationId, runId, operationId, sceneId, stageName, {
        state: 'failed',
        error:
          error instanceof Error
            ? error.message.slice(0, 4_000)
            : 'Scene dispatch failed before reaching a provider.',
      });
    const line = quote.items.find(
      (item) =>
        item.sceneId === sceneId &&
        item.stage === stageName &&
        item.attempt === stage.attempt,
    );
    const output = config.draft.output;
    try {
      if (!line)
        throw new ConflictException(
          'No accepted quote covers this scene. Request a repair quote.',
        );
      await this.planning.assertDraftAssetsAuthorized(organizationId, brandId, {
        ...config.draft,
        identity: saved.identity,
      });
      if (
        JSON.stringify(saved.referenceAssetIds) !==
        JSON.stringify(
          config.draft.references.map((reference) => reference.assetId),
        )
      )
        throw new ConflictException('Accepted references changed.');
      if (!('aspectRatio' in output))
        throw new ConflictException('Missing scene aspect ratio.');
    } catch (error: unknown) {
      // Deterministic pre-dispatch failures are repaired with a new quote
      // rather than retried every step.
      await markFailed(error);
      throw error;
    }
    if (!line || !('aspectRatio' in output)) return;
    const claimToken = randomUUID();
    await this.patch(
      organizationId,
      runId,
      operationId,
      sceneId,
      stageName,
      {
        state: 'claimed',
        claimedAt: new Date().toISOString(),
        claimToken,
      },
      undefined,
      { isClaim: true },
    );
    let placeholderId: string | undefined;
    const onPlaceholderCreated: PlaceholderCreated = async (assetId) => {
      placeholderId = assetId;
      await this.patch(organizationId, runId, operationId, sceneId, stageName, {
        assetId,
      });
    };
    const user: AuthenticatedUser = {
      id: userId,
      userId,
      organizationId,
      brandId,
    };
    try {
      await this.dispatchClaimedStage(
        organizationId,
        runId,
        operationId,
        brandId,
        config,
        scene,
        sceneId,
        stageName,
        saved,
        line,
        groupId,
        output.aspectRatio,
        user,
        onPlaceholderCreated,
      );
    } catch (error: unknown) {
      // Without a placeholder no provider was called: the claim is released
      // as a definitive failure the user repairs with a new quote.
      if (!placeholderId) await markFailed(error);
      throw error;
    }
  }
  private async dispatchClaimedStage(
    organizationId: string,
    runId: string,
    operationId: string,
    brandId: string,
    config: BrandRemixRunConfig,
    scene: BrandRemixStoryboardScene,
    sceneId: string,
    stageName: SceneStageName,
    saved: SavedRemixScene,
    line: SceneQuoteLine,
    groupId: string,
    aspectRatio: string,
    user: AuthenticatedUser,
    onPlaceholderCreated: PlaceholderCreated,
  ): Promise<void> {
    if (stageName === 'image') {
      await this.dispatchSceneImage(
        organizationId,
        runId,
        operationId,
        brandId,
        config,
        scene,
        sceneId,
        stageName,
        saved,
        line,
        groupId,
        aspectRatio,
        user,
        onPlaceholderCreated,
      );
      return;
    }
    await this.dispatchSceneVideo(
      organizationId,
      brandId,
      runId,
      operationId,
      scene,
      sceneId,
      stageName,
      saved,
      line,
      groupId,
      aspectRatio,
      user,
      onPlaceholderCreated,
    );
  }
  private async dispatchSceneImage(
    organizationId: string,
    runId: string,
    operationId: string,
    brandId: string,
    config: BrandRemixRunConfig,
    scene: BrandRemixStoryboardScene,
    sceneId: string,
    stageName: SceneStageName,
    saved: SavedRemixScene,
    line: SceneQuoteLine,
    groupId: string,
    aspectRatio: string,
    user: AuthenticatedUser,
    onPlaceholderCreated: PlaceholderCreated,
  ): Promise<void> {
    const sourceActionId = this.billing.key(runId, operationId, line);
    const request = {
      user,
      body: { sourceActionId },
      creditsConfig: { deferred: true },
    } as RequestWithContext & DeferredCreditsRequest;
    const references: ImageGenerationBriefReference[] =
      config.draft.references.flatMap(({ assetId, role, description }) =>
        role === 'first_frame' ||
        role === 'last_frame' ||
        role === 'reference_video'
          ? []
          : [{ assetId, role, description }],
      );
    references.push({
      assetId: saved.identity.avatarAssetId,
      role: 'character',
      description: 'Preserve the selected saved brand persona.',
    });
    const dimensions = resolveAgentGenerationDimensions(
      aspectRatio,
      DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
    );
    const response = await this.images.generateImage(
      user,
      {
        brandId,
        sourceActionId,
        model: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2,
        autoSelectModel: false,
        ...dimensions,
        outputs: 1,
        fidelityMode: 'guided',
        brandingMode: 'brand',
        isBrandingEnabled: true,
        waitForCompletion: false,
        references: references.map((reference) => reference.assetId),
        text: `Create a new original brand ad scene. ${scene.visualIntent}\nPreserve selected identity and authorized products. No source footage, text, watermarks, or competitor identity.`,
      } as CreateImageDto,
      request,
      onPlaceholderCreated,
      { groupId, groupIndex: 0, settleCreditsExternally: true },
      async () => {
        const credits = request.creditsConfig;
        if (
          !credits ||
          (credits.isByokBypass ? 0 : credits.amount) !== line.credits ||
          Boolean(credits.isByokBypass) !== (line.billingMode === 'byok') ||
          (line.credits > 0 && !credits.reservationId)
        ) {
          if (credits?.reservationId)
            await this.billing.releaseImageReservation(
              organizationId,
              credits.reservationId,
            );
          throw new ConflictException(
            'Image billing changed after the accepted quote.',
          );
        }
        await this.billing.reserve(
          organizationId,
          runId,
          operationId,
          line,
          credits.reservationId,
        );
      },
      references,
    );
    if (!response.data?.id)
      throw new ConflictException('Image provider returned no durable asset.');
    // Settlement waits for a usable still; a failed provider output releases.
    await this.patch(organizationId, runId, operationId, sceneId, stageName, {
      assetId: response.data.id,
      state: 'submitted',
    });
  }
  private async dispatchSceneVideo(
    organizationId: string,
    brandId: string,
    runId: string,
    operationId: string,
    scene: BrandRemixStoryboardScene,
    sceneId: string,
    stageName: SceneStageName,
    saved: SavedRemixScene,
    line: SceneQuoteLine,
    groupId: string,
    aspectRatio: string,
    user: AuthenticatedUser,
    onPlaceholderCreated: PlaceholderCreated,
  ): Promise<void> {
    if (!saved.image.assetId || saved.image.state !== 'ready')
      throw new ConflictException('The generated scene still is not ready.');
    const still = await this.asset(
      organizationId,
      brandId,
      saved.image.assetId,
      saved.image.groupId ??
        this.group(runId, sceneId, 'image', saved.image.attempt),
      'IMAGE',
    );
    if (!['GENERATED', 'VALIDATED'].includes(still.status ?? ''))
      throw new ConflictException(
        'The generated scene still is no longer ready.',
      );
    const photoUrl =
      readIngredientMediaUrl(still) ??
      (still.s3Key ? this.mediaUrls.buildUrl(still.s3Key) : undefined);
    if (!photoUrl)
      throw new ConflictException(
        'Generated scene still has no usable media URL.',
      );
    const result = await this.avatars.generateAvatarVideo(
      {
        aspectRatio: remixAvatarAspectRatio(aspectRatio),
        clonedVoiceId: saved.identity.speechVoiceId,
        photoIngredientId: still.id,
        photoUrl,
        text: scene.narration ?? '',
      },
      { organizationId, brandId, userId: user.userId },
      onPlaceholderCreated,
      {
        groupId,
        groupIndex: 0,
        settleCreditsExternally: true,
        isByokBypass: line.billingMode === 'byok',
      },
      async () => {
        await this.billing.reserve(organizationId, runId, operationId, line);
      },
    );
    await this.patch(organizationId, runId, operationId, sceneId, stageName, {
      assetId: result.ingredientId,
      state: 'submitted',
    });
  }
  private async patch(
    organizationId: string,
    runId: string,
    operationId: string,
    sceneId: string,
    stage: 'image' | 'video',
    patch: Partial<SceneStage>,
    actualDurationSeconds?: number,
    options: { isClaim?: boolean } = {},
  ) {
    // Only a new claim needs a live operation; recording work a provider
    // already accepted must survive a concurrent cancellation.
    const { config } = await this.store.fence(
      organizationId,
      runId,
      operationId,
      { allowCancelled: !options.isClaim },
    );
    const pipeline = config.scenePipeline;
    const scene = pipeline?.scenes[sceneId];
    if (!pipeline || !scene) throw new ConflictException('Scene was removed.');
    await this.store.save(organizationId, runId, config, {
      ...config,
      scenePipeline: {
        ...pipeline,
        scenes: {
          ...pipeline.scenes,
          [sceneId]: {
            ...scene,
            [stage]: { ...scene[stage], ...patch },
            ...(actualDurationSeconds ? { actualDurationSeconds } : {}),
          },
        },
      },
    });
  }
}
