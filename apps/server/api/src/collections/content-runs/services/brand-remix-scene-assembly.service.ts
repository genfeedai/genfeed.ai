import { randomUUID } from 'node:crypto';
import { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import { BrandRemixSceneGenerationService } from '@api/collections/content-runs/services/brand-remix-scene-generation.service';
import { BrandRemixSceneBillingService } from '@api/collections/content-runs/services/brand-remix-scene-billing.service';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/index';
import { IngredientCategory, IngredientStatus, MetadataExtension } from '@genfeedai/contracts';
import type { BrandRemixScenePipeline } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import { resolveAgentGenerationDimensions, DEFAULT_AGENT_IMAGE_ASPECT_RATIO } from '@genfeedai/contracts/constants';
import { assertSafeObjectKey } from '@libs/security';
import { ConflictException, Injectable } from '@nestjs/common';
import { z } from 'zod';

const persistedOutput = z.object({ success: z.literal(true), s3Key: z.string().min(1), duration: z.number().positive().optional(), width: z.number().positive().optional(), height: z.number().positive().optional(), size: z.number().positive().optional() });
@Injectable()
export class BrandRemixSceneAssemblyService {
  constructor(private readonly store: BrandRemixSceneStoreService, private readonly generation: BrandRemixSceneGenerationService, private readonly billing: BrandRemixSceneBillingService, private readonly planning: BrandRemixRunPlanningService, private readonly queue: FileQueueService, private readonly whisper: WhisperService, private readonly mediaUrls: MediaUrlService, private readonly shared: SharedService, private readonly prisma: PrismaService) {}
  async step(organizationId: string, runId: string, operationId: string): Promise<boolean> {
    const { config, brandId } = await this.store.fence(organizationId, runId, operationId);
    const pipeline = config.scenePipeline;
    if (!pipeline?.operation || !pipeline.quote) throw new ConflictException('Missing assembly operation.');
    const userId = pipeline.operation.userId;
    const sceneIds = config.concept?.storyboard.map((scene) => scene.id) ?? [];
    const clips = await Promise.all(sceneIds.map(async (sceneId) => {
      const scene = sceneId ? pipeline.scenes[sceneId] : undefined;
      if (!sceneId || !scene?.video.assetId || scene.video.state !== 'ready') throw new ConflictException('Complete every generated scene before assembly.');
      const clip = await this.generation.asset(organizationId, brandId, scene.video.assetId, this.generation.group(runId, sceneId, 'video', scene.video.attempt), 'AVATAR');
      if (!['GENERATED', 'VALIDATED'].includes(clip.status ?? '') || !clip.s3Key || !scene.actualDurationSeconds) throw new ConflictException('Completed scene storage or duration is unavailable.');
      const key = assertSafeObjectKey(clip.s3Key, (message) => new ConflictException(message));
      if (!key.startsWith('ingredients/avatars/') && !key.startsWith('ingredients/videos/')) throw new ConflictException('Invalid generated clip storage key.');
      return { id: clip.id, key, duration: scene.actualDurationSeconds };
    }));
    if (clips.reduce((sum, clip) => sum + clip.duration, 0) > 90) throw new ConflictException('The generated ad exceeds 90 seconds. Repair scene narration.');
    const orderedAssetIds = clips.map((clip) => clip.id);
    let assembly = pipeline.assembly;
    if (!assembly) {
      const create = async (index: number) => {
        const groupId = `remix-assembly-${runId}-${operationId}`;
        const existing = await this.prisma.ingredient.findFirst({ where: scopedWhere(organizationId, { brandId, groupId, groupIndex: index, category: 'VIDEO' }) });
        if (existing) return existing.id;
        const { ingredientData } = await this.shared.createMediaDocumentsInternal({ brandId, category: IngredientCategory.VIDEO, extension: MetadataExtension.MP4, organizationId, userId, groupId, groupIndex: index, sourceIds: orderedAssetIds, status: IngredientStatus.PROCESSING });
        return String(ingredientData.id);
      };
      const mergedAssetId = await create(0);
      const assetId = await create(1);
      assembly = { mergedAssetId, assetId, orderedAssetIds, mergeJobId: `remix-merge-${mergedAssetId}`, captionJobId: `remix-captions-${assetId}`, transcription: { attempt: pipeline.quote.items.find((line) => line.stage === 'captions')?.attempt ?? 1, state: 'pending' } };
      await this.patch(organizationId, runId, operationId, assembly);
    }
    if (JSON.stringify(assembly.orderedAssetIds) !== JSON.stringify(orderedAssetIds) || !assembly.mergedAssetId || !assembly.assetId) throw new ConflictException('Assembly inputs changed.');
    const output = config.draft.output;
    if (!('aspectRatio' in output)) throw new ConflictException('Missing composition aspect ratio.');
    if (!assembly.mergedStorageKey) {
      const job = await this.queue.processVideo({ id: assembly.mergeJobId, ingredientId: assembly.mergedAssetId, organizationId, userId, type: 'merge-videos', params: { sourceIds: orderedAssetIds, sourceStorageKeys: clips.map((clip) => clip.key), isPersistedOutputOnly: true, normalizeClips: true, ...resolveAgentGenerationDimensions(output.aspectRatio, DEFAULT_AGENT_IMAGE_ASPECT_RATIO) } });
      const status = await this.queue.getJobStatus(job.jobId);
      if (status.state === 'failed') throw new ConflictException('Scene merge failed. Resume to retry local assembly.');
      if (status.state !== 'completed') return false;
      const result = persistedOutput.parse(status.result);
      this.safeVideoKey(result.s3Key);
      await this.persistAsset(organizationId, brandId, assembly.mergedAssetId, result.s3Key);
      await this.patch(organizationId, runId, operationId, { ...assembly, mergedStorageKey: result.s3Key });
      return false;
    }
    if (!assembly.srt) {
      if (assembly.transcription.state !== 'pending') throw new ConflictException('Caption transcription acceptance is uncertain. Reconcile before retrying.');
      const line = pipeline.quote.items.find((candidate) => candidate.stage === 'captions');
      if (!line) throw new ConflictException('Caption transcription was not quoted.');
      await this.patch(organizationId, runId, operationId, { ...assembly, transcription: { ...assembly.transcription, state: 'claimed', claimToken: randomUUID(), claimedAt: new Date().toISOString() } });
      await this.billing.reserve(organizationId, runId, operationId, line);
      const transcription = await this.whisper.transcribeUrl(this.mediaUrls.buildUrl(assembly.mergedStorageKey), 'en');
      await this.billing.settle(organizationId, runId, operationId, line);
      if (!transcription.srt.trim()) throw new ConflictException('Generated speech produced no captions.');
      await this.patch(organizationId, runId, operationId, { ...assembly, srt: transcription.srt, transcription: { ...assembly.transcription, state: 'ready' } });
      return false;
    }
    const captionJob = await this.queue.processVideo({ id: assembly.captionJobId, ingredientId: assembly.assetId, organizationId, userId, type: 'add-captions', params: { inputPath: this.mediaUrls.buildUrl(assembly.mergedStorageKey), captionContent: assembly.srt } });
    const status = await this.queue.getJobStatus(captionJob.jobId);
    if (status.state === 'failed') throw new ConflictException('Caption rendering failed. The ad is not complete. Resume without repeating transcription.');
    if (status.state !== 'completed') return false;
    const result = persistedOutput.parse(status.result);
    this.safeVideoKey(result.s3Key);
    await this.store.fence(organizationId, runId, operationId);
    await this.persistAsset(organizationId, brandId, assembly.assetId, result.s3Key);
    const current = await this.store.fence(organizationId, runId, operationId);
    const context = await this.planning.resolveBrandContext(organizationId, brandId);
    await this.store.save(organizationId, runId, current.config, { ...current.config, phase: 'ready_for_review', execution: { actualCount: 1, requestedCount: 1, generationBrief: this.planning.buildGenerationBrief(context, current.config), variants: [{ id: `scene-final-${operationId}`, assetIds: [assembly.assetId], recipeRevision: config.revision, status: 'ready' }] }, scenePipeline: { ...pipeline, state: 'ready', assembly: { ...assembly, finalStorageKey: result.s3Key }, operation: undefined } });
    return true;
  }
  private safeVideoKey(key: string) { assertSafeObjectKey(key, (message) => new ConflictException(message)); if (!key.startsWith('ingredients/videos/')) throw new ConflictException('Files did not return a persisted video key.'); }
  private async persistAsset(organizationId: string, brandId: string, id: string, s3Key: string) {
    const updated = await this.prisma.ingredient.updateMany({ where: scopedWhere(organizationId, { id, brandId, category: 'VIDEO' }), data: { status: IngredientStatus.GENERATED, s3Key } });
    if (updated.count !== 1) throw new ConflictException('Composition output is unavailable.');
  }
  private async patch(organizationId: string, runId: string, operationId: string, assembly: NonNullable<BrandRemixScenePipeline['assembly']>) {
    const { config } = await this.store.fence(organizationId, runId, operationId);
    if (!config.scenePipeline) throw new ConflictException('Scene state disappeared.');
    await this.store.save(organizationId, runId, config, { ...config, scenePipeline: { ...config.scenePipeline, state: 'assembling', assembly } });
  }
}
