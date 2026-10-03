import { randomUUID } from 'node:crypto';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { BrandRemixSceneBillingService } from '@api/collections/content-runs/services/brand-remix-scene-billing.service';
import { BrandRemixSceneGenerationService } from '@api/collections/content-runs/services/brand-remix-scene-generation.service';
import {
  assertSceneBriefFidelity,
  assertSupportedSceneFidelity,
  isRetryableSyncSceneStage,
} from '@api/collections/content-runs/services/brand-remix-scene-state';
import { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import { scopedWhere } from '@api/index';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { VideoStitchService } from '@api/services/video-stitch/video-stitch.service';
import type { VideoStitchRequest } from '@api/services/video-stitch/video-stitch.types';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import type { BrandRemixScenePipeline } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import {
  DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import { videoStitchJobId } from '@genfeedai/contracts/interfaces';
import { assertSafeObjectKey } from '@libs/security';
import { ConflictException, Injectable } from '@nestjs/common';
import { z } from 'zod';

const persistedOutput = z.object({
  success: z.literal(true),
  s3Key: z.string().min(1),
  duration: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  size: z.number().positive().optional(),
});
/** Maps a storyboard run's ready scene clips onto the stitch service. */
export function toStoryboardRunStitchRequest(
  organizationId: string,
  brandId: string,
  runId: string,
  operationId: string,
  userId: string,
  orderedAssetIds: string[],
  aspectRatio: string,
): VideoStitchRequest {
  const { height, width } = resolveAgentGenerationDimensions(
    aspectRatio,
    DEFAULT_AGENT_IMAGE_ASPECT_RATIO,
  );
  return {
    brandId,
    callerKind: 'storyboard_run',
    clipIds: orderedAssetIds,
    idempotencyKey: `storyboard-run:${runId}:${operationId}`,
    mode: 'finalize',
    organizationId,
    output: { height, resize: 'per_clip', width },
    settings: {},
    userId,
  };
}

@Injectable()
export class BrandRemixSceneAssemblyService {
  constructor(
    private readonly files: FilesClientService,
    private readonly store: BrandRemixSceneStoreService,
    private readonly generation: BrandRemixSceneGenerationService,
    private readonly billing: BrandRemixSceneBillingService,
    private readonly planning: BrandRemixRunPlanningService,
    private readonly queue: FileQueueService,
    private readonly whisper: WhisperService,
    private readonly mediaUrls: MediaUrlService,
    private readonly shared: SharedService,
    private readonly prisma: PrismaService,
    private readonly stitch: VideoStitchService,
  ) {}
  async step(
    organizationId: string,
    runId: string,
    operationId: string,
  ): Promise<boolean> {
    const { config, brandId } = await this.store.fence(
      organizationId,
      runId,
      operationId,
    );
    const pipeline = config.scenePipeline;
    if (!pipeline?.operation || !pipeline.quote)
      throw new ConflictException('Missing assembly operation.');
    assertSupportedSceneFidelity(config);
    const userId = pipeline.operation.userId;
    const clips = await this.loadReadyClips(
      organizationId,
      brandId,
      runId,
      pipeline,
      config.concept?.storyboard.map((scene) => scene.id) ?? [],
    );
    if (clips.reduce((sum, clip) => sum + clip.duration, 0) > 90)
      throw new ConflictException(
        'The generated ad exceeds 90 seconds. Repair scene narration.',
      );
    const orderedAssetIds = clips.map((clip) => clip.id);
    const output = config.draft.output;
    if (!('aspectRatio' in output))
      throw new ConflictException('Missing composition aspect ratio.');
    const stitchRequest = toStoryboardRunStitchRequest(
      organizationId,
      brandId,
      runId,
      operationId,
      userId,
      orderedAssetIds,
      output.aspectRatio,
    );
    const assembly = await this.ensureAssembly(
      organizationId,
      brandId,
      runId,
      operationId,
      userId,
      pipeline.quote,
      stitchRequest,
      pipeline.assembly,
    );
    if (
      JSON.stringify(assembly.orderedAssetIds) !==
        JSON.stringify(orderedAssetIds) ||
      !assembly.mergedAssetId ||
      !assembly.assetId
    )
      throw new ConflictException('Assembly inputs changed.');
    if (!assembly.mergedStorageKey) {
      await this.mergeSceneClips(
        organizationId,
        runId,
        operationId,
        assembly,
        assembly.mergedAssetId,
        stitchRequest,
      );
      return false;
    }
    if (!assembly.srt) {
      await this.transcribeCaptions(
        organizationId,
        runId,
        operationId,
        assembly,
      );
      return false;
    }
    return this.finishCaptionedAd(
      organizationId,
      brandId,
      runId,
      operationId,
      userId,
      config.revision,
      pipeline,
      assembly,
      assembly.assetId,
      assembly.mergedStorageKey,
      assembly.srt,
    );
  }
  private async mergeSceneClips(
    organizationId: string,
    runId: string,
    operationId: string,
    assembly: NonNullable<BrandRemixScenePipeline['assembly']>,
    mergedAssetId: string,
    request: VideoStitchRequest,
  ): Promise<void> {
    // A merge that failed on an earlier step is requeued on this (resumed)
    // step; one that fails now surfaces before anything else runs.
    const handle = await this.stitch.retry(request, {
      jobId: assembly.mergeJobId ?? videoStitchJobId(mergedAssetId),
      organizationId,
      outputId: mergedAssetId,
    });
    if (handle.jobId !== assembly.mergeJobId)
      await this.patch(organizationId, runId, operationId, {
        ...assembly,
        mergeJobId: handle.jobId,
      });
    const outcome = await this.stitch.settle(handle);
    if (outcome.state === 'failed')
      throw new ConflictException(
        'Scene merge failed. Resume to retry local assembly.',
      );
    if (outcome.state !== 'generated' || !outcome.s3Key) return;
    this.safeVideoKey(outcome.s3Key);
    await this.probeComposition(outcome.s3Key);
    await this.patch(organizationId, runId, operationId, {
      ...assembly,
      mergeJobId: handle.jobId,
      mergedStorageKey: outcome.s3Key,
    });
  }
  private async finishCaptionedAd(
    organizationId: string,
    brandId: string,
    runId: string,
    operationId: string,
    userId: string,
    revision: number,
    pipeline: BrandRemixScenePipeline,
    assembly: NonNullable<BrandRemixScenePipeline['assembly']>,
    assetId: string,
    mergedStorageKey: string,
    srt: string,
  ): Promise<boolean> {
    const captionJob = await this.queue.processVideo({
      id: assembly.captionJobId,
      ingredientId: assetId,
      organizationId,
      userId,
      type: 'add-captions',
      params: {
        inputPath: this.mediaUrls.buildUrl(mergedStorageKey),
        captionContent: srt,
      },
    });
    const status = await this.queue.getJobStatus(captionJob.jobId);
    if (status.state === 'failed')
      throw new ConflictException(
        'Caption rendering failed. The ad is not complete. Resume without repeating transcription.',
      );
    if (status.state !== 'completed') return false;
    const result = persistedOutput.parse(status.result);
    this.safeVideoKey(result.s3Key);
    await this.store.fence(organizationId, runId, operationId);
    await this.persistAsset(organizationId, brandId, assetId, result.s3Key);
    const current = await this.store.fence(organizationId, runId, operationId);
    const currentPipeline = current.config.scenePipeline ?? pipeline;
    assertSupportedSceneFidelity(current.config);
    const context = await this.planning.resolveBrandContext(
      organizationId,
      brandId,
    );
    const generationBrief = this.planning.buildGenerationBrief(
      context,
      current.config,
    );
    assertSceneBriefFidelity(generationBrief.fidelityMode);
    await this.store.save(organizationId, runId, current.config, {
      ...current.config,
      phase: 'ready_for_review',
      execution: {
        actualCount: 1,
        requestedCount: 1,
        generationBrief,
        variants: [
          {
            id: `scene-final-${operationId}`,
            assetIds: [assetId],
            recipeRevision: revision,
            status: 'ready',
          },
        ],
      },
      scenePipeline: {
        ...currentPipeline,
        state: 'ready',
        assembly: { ...assembly, finalStorageKey: result.s3Key },
        operation: undefined,
      },
    });
    return true;
  }
  private async ensureAssembly(
    organizationId: string,
    brandId: string,
    runId: string,
    operationId: string,
    userId: string,
    quote: NonNullable<BrandRemixScenePipeline['quote']>,
    stitchRequest: VideoStitchRequest,
    existing: BrandRemixScenePipeline['assembly'],
  ): Promise<NonNullable<BrandRemixScenePipeline['assembly']>> {
    if (existing) return existing;
    const orderedAssetIds = stitchRequest.clipIds;
    const merge = await this.stitch.stitch(stitchRequest);
    const groupId = `remix-assembly-${runId}-${operationId}`;
    const found = await this.prisma.ingredient.findFirst({
      where: scopedWhere(organizationId, {
        brandId,
        groupId,
        groupIndex: 1,
        category: 'VIDEO' as const,
      }),
    });
    const assetId = found
      ? found.id
      : String(
          (
            await this.shared.createMediaDocumentsInternal({
              origin: IngredientOrigin.GENERATED,
              brandId,
              category: IngredientCategory.VIDEO,
              extension: MetadataExtension.MP4,
              organizationId,
              userId,
              groupId,
              groupIndex: 1,
              sourceIds: orderedAssetIds,
              status: IngredientStatus.PROCESSING,
            })
          ).ingredientData.id,
        );
    const assembly = {
      mergedAssetId: merge.outputId,
      assetId,
      orderedAssetIds,
      mergeJobId: merge.jobId,
      captionJobId: `remix-captions-${assetId}`,
      transcription: {
        attempt:
          quote.items.find((line) => line.stage === 'captions')?.attempt ?? 1,
        state: 'pending' as const,
      },
    };
    await this.patch(organizationId, runId, operationId, assembly);
    return assembly;
  }
  private async loadReadyClips(
    organizationId: string,
    brandId: string,
    runId: string,
    pipeline: BrandRemixScenePipeline,
    sceneIds: Array<string | undefined>,
  ) {
    return Promise.all(
      sceneIds.map(async (sceneId) => {
        const scene = sceneId ? pipeline.scenes[sceneId] : undefined;
        if (!sceneId || !scene?.video.assetId || scene.video.state !== 'ready')
          throw new ConflictException(
            'Complete every generated scene before assembly.',
          );
        const clip = await this.generation.asset(
          organizationId,
          brandId,
          scene.video.assetId,
          scene.video.groupId ??
            this.generation.group(runId, sceneId, 'video', scene.video.attempt),
          'AVATAR',
        );
        if (
          !['GENERATED', 'VALIDATED'].includes(clip.status ?? '') ||
          !clip.s3Key ||
          !scene.actualDurationSeconds
        )
          throw new ConflictException(
            'Completed scene storage or duration is unavailable.',
          );
        const key = assertSafeObjectKey(
          clip.s3Key,
          (message) => new ConflictException(message),
        );
        if (
          !key.startsWith('ingredients/avatars/') &&
          !key.startsWith('ingredients/videos/')
        )
          throw new ConflictException('Invalid generated clip storage key.');
        return { id: clip.id, key, duration: scene.actualDurationSeconds };
      }),
    );
  }
  private async transcribeCaptions(
    organizationId: string,
    runId: string,
    operationId: string,
    assembly: NonNullable<BrandRemixScenePipeline['assembly']>,
  ) {
    const stage = assembly.transcription;
    // A failed attempt already returned its hold, so it cannot rerun unbilled.
    if (stage.state === 'failed')
      throw new ConflictException(
        'Caption transcription failed. Request a new generation quote.',
      );
    // Whisper is synchronous: an uncertain or abandoned attempt reruns under
    // the same idempotent reservation instead of blocking the run.
    if (stage.state !== 'ready' && !isRetryableSyncSceneStage(stage))
      throw new ConflictException(
        'Caption transcription is still running. Wait before resuming.',
      );
    if (stage.state === 'ready')
      throw new ConflictException(
        'Caption transcription is ready but captions were not stored. Reconcile before retrying.',
      );
    const { config } = await this.store.fence(
      organizationId,
      runId,
      operationId,
    );
    const line = config.scenePipeline?.quote?.items.find(
      (candidate) => candidate.stage === 'captions',
    );
    if (!line || !assembly.mergedStorageKey)
      throw new ConflictException('Caption transcription was not quoted.');
    const claimed: NonNullable<BrandRemixScenePipeline['assembly']> = {
      ...assembly,
      transcription: {
        ...stage,
        state: 'claimed',
        claimToken: randomUUID(),
        claimedAt: new Date().toISOString(),
      },
    };
    await this.writeAssembly(organizationId, runId, operationId, claimed);
    let dispatched = false;
    let persisted = false;
    try {
      await this.billing.reserve(organizationId, runId, operationId, line);
      dispatched = true;
      const transcription = await this.whisper.transcribeUrl(
        this.mediaUrls.buildUrl(assembly.mergedStorageKey),
        'en',
      );
      const snapshot = await this.store.read(organizationId, runId);
      const cancelled = this.isCancelled(
        snapshot.config.scenePipeline,
        operationId,
      );
      if (!transcription.srt.trim()) {
        await this.billing.release(organizationId, runId, operationId, line);
        await this.writeAssembly(organizationId, runId, operationId, {
          ...claimed,
          transcription: {
            ...claimed.transcription,
            state: 'failed',
            error: 'Generated speech produced no captions.',
          },
        });
        persisted = true;
        throw new ConflictException('Generated speech produced no captions.');
      }
      await this.billing.settle(organizationId, runId, operationId, line);
      await this.writeAssembly(organizationId, runId, operationId, {
        ...claimed,
        srt: transcription.srt,
        transcription: {
          attempt: claimed.transcription.attempt,
          claimToken: claimed.transcription.claimToken,
          claimedAt: claimed.transcription.claimedAt,
          state: 'ready',
        },
      });
      persisted = true;
      if (cancelled)
        throw new ConflictException(
          'Scene operation was cancelled or superseded.',
        );
    } catch (error: unknown) {
      if (persisted) throw error;
      if (!dispatched)
        await this.billing.release(organizationId, runId, operationId, line);
      await this.writeAssembly(organizationId, runId, operationId, {
        ...claimed,
        transcription: {
          ...claimed.transcription,
          state: dispatched ? 'uncertain' : 'failed',
          error:
            error instanceof Error
              ? error.message
              : 'Caption transcription failed',
        },
      });
      throw error;
    }
  }
  private isCancelled(
    pipeline: BrandRemixScenePipeline | undefined,
    operationId: string,
  ) {
    return Boolean(
      pipeline?.operation?.id === operationId &&
        (pipeline.state === 'cancelled' ||
          pipeline.operation.cancellationGeneration !==
            pipeline.cancellationGeneration),
    );
  }
  private async writeAssembly(
    organizationId: string,
    runId: string,
    operationId: string,
    assembly: NonNullable<BrandRemixScenePipeline['assembly']>,
  ) {
    const { config } = await this.store.read(organizationId, runId);
    const pipeline = config.scenePipeline;
    if (!pipeline?.operation || pipeline.operation.id !== operationId)
      throw new ConflictException(
        'Scene operation was cancelled or superseded.',
      );
    if (
      pipeline.state !== 'cancelled' &&
      pipeline.operation.cancellationGeneration !==
        pipeline.cancellationGeneration
    )
      throw new ConflictException(
        'Scene operation was cancelled or superseded.',
      );
    await this.store.save(organizationId, runId, config, {
      ...config,
      scenePipeline: {
        ...pipeline,
        state: pipeline.state === 'cancelled' ? 'cancelled' : 'assembling',
        assembly,
      },
    });
  }
  private safeVideoKey(key: string) {
    assertSafeObjectKey(key, (message) => new ConflictException(message));
    if (!key.startsWith('ingredients/videos/'))
      throw new ConflictException(
        'Files did not return a persisted video key.',
      );
  }
  private async probeComposition(s3Key: string) {
    const probe = await this.files.probeMediaFromUrl(
      this.mediaUrls.buildUrl(s3Key),
      'video',
    );
    if (
      !probe.durationSeconds ||
      probe.durationSeconds > 90 ||
      !probe.width ||
      !probe.height ||
      !probe.audioCodec ||
      !probe.sizeBytes
    )
      throw new ConflictException(
        'Composition requires valid generated speech and media metadata.',
      );
    return {
      durationSeconds: probe.durationSeconds,
      height: probe.height,
      sizeBytes: probe.sizeBytes,
      width: probe.width,
    };
  }
  private async persistAsset(
    organizationId: string,
    brandId: string,
    id: string,
    s3Key: string,
  ) {
    const asset = await this.prisma.ingredient.findFirst({
      where: scopedWhere(organizationId, {
        id,
        brandId,
        category: 'VIDEO' as const,
      }),
    });
    if (!asset?.metadataId)
      throw new ConflictException('Composition metadata is unavailable.');
    const probe = await this.probeComposition(s3Key);
    await this.prisma.metadata.updateMany({
      where: {
        id: asset.metadataId,
        isDeleted: false,
        ingredients: { some: scopedWhere(organizationId, { id, brandId }) },
      },
      data: {
        result: s3Key,
        duration: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        size: probe.sizeBytes,
        hasAudio: true,
      },
    });
    const updated = await this.prisma.ingredient.updateMany({
      where: scopedWhere(organizationId, {
        id,
        brandId,
        category: 'VIDEO' as const,
      }),
      data: { status: IngredientStatus.GENERATED, s3Key },
    });
    if (updated.count !== 1)
      throw new ConflictException('Composition output is unavailable.');
  }
  private async patch(
    organizationId: string,
    runId: string,
    operationId: string,
    assembly: NonNullable<BrandRemixScenePipeline['assembly']>,
  ) {
    const { config } = await this.store.fence(
      organizationId,
      runId,
      operationId,
    );
    if (!config.scenePipeline)
      throw new ConflictException('Scene state disappeared.');
    await this.store.save(organizationId, runId, config, {
      ...config,
      scenePipeline: { ...config.scenePipeline, state: 'assembling', assembly },
    });
  }
}
