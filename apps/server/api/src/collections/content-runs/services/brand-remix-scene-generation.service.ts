import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { remixAvatarAspectRatio } from '@api/collections/content-runs/services/brand-remix-run-helpers';
import { BrandRemixSceneStoreService } from '@api/collections/content-runs/services/brand-remix-scene-store.service';
import { BrandRemixSceneBillingService } from '@api/collections/content-runs/services/brand-remix-scene-billing.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { scopedWhere } from '@api/index';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { BrandRemixScenePipeline } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import type { ImageGenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { MODEL_KEYS, resolveAgentGenerationDimensions, DEFAULT_AGENT_IMAGE_ASPECT_RATIO } from '@genfeedai/contracts/constants';
import { readIngredientMediaUrl } from '@libs/media/media-url.util';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixSceneGenerationService {
  constructor(private readonly store: BrandRemixSceneStoreService, private readonly billing: BrandRemixSceneBillingService, private readonly planning: BrandRemixRunPlanningService, private readonly prisma: PrismaService, private readonly files: FilesClientService, private readonly mediaUrls: MediaUrlService, private readonly images: ImageGenerationService, private readonly avatars: AvatarVideoGenerationService) {}
  group(runId: string, sceneId: string, stage: string, attempt: number) { return `remix-${runId}-${sceneId}-${stage}-${attempt}`; }
  async asset(organizationId: string, brandId: string, assetId: string, groupId: string, category: 'IMAGE' | 'AVATAR') {
    const asset = await this.prisma.ingredient.findFirst({ where: scopedWhere(organizationId, { id: assetId, brandId, groupId, category }), include: { metadata: true } });
    if (!asset || asset.sourceActionId?.startsWith('remix-source:')) throw new ConflictException('Generated scene asset is unavailable or outside this run.');
    return asset;
  }
  async step(organizationId: string, runId: string, operationId: string): Promise<boolean> {
    let { config, brandId } = await this.store.fence(organizationId, runId, operationId);
    for (const scene of config.concept?.storyboard ?? []) {
      if (!scene.id) throw new ConflictException('Missing stable scene identity.');
      for (const stageName of ['image', 'video'] as const) {
        const pipeline = config.scenePipeline;
        const saved = pipeline?.scenes[scene.id];
        if (!pipeline?.operation || !pipeline.quote || !saved) throw new ConflictException('Missing accepted scene snapshot.');
        const stage = saved[stageName];
        if (stage.state === 'ready') continue;
        const groupId = this.group(runId, scene.id, stageName, stage.attempt);
        const category = stageName === 'image' ? 'IMAGE' : 'AVATAR';
        if (stage.state !== 'pending') {
          const found = stage.assetId ? await this.asset(organizationId, brandId, stage.assetId, groupId, category) : await this.prisma.ingredient.findFirst({ where: scopedWhere(organizationId, { brandId, groupId, category }), include: { metadata: true } });
          if (!found) throw new ConflictException('Provider acceptance is uncertain; no new paid attempt will be dispatched.');
          if (found.status === 'FAILED') throw new ConflictException('Scene generation failed. Request an explicit repair quote.');
          if (!['GENERATED', 'VALIDATED'].includes(found.status ?? '')) {
            if (!stage.assetId) await this.patch(organizationId, runId, operationId, scene.id, stageName, { assetId: found.id, state: 'submitted' });
            return false;
          }
          let actualDurationSeconds = saved.actualDurationSeconds;
          if (stageName === 'video') {
            const url = readIngredientMediaUrl(found) ?? (found.s3Key ? this.mediaUrls.buildUrl(found.s3Key) : undefined);
            if (!url) throw new ConflictException('Completed scene video has no media URL.');
            const probe = await this.files.probeMediaFromUrl(url, 'video');
            if (!probe.durationSeconds || probe.durationSeconds > 20 || !probe.width || !probe.height || !probe.audioCodec) throw new ConflictException('Scene needs repair: expected speech audio and a clip up to 20 seconds.');
            actualDurationSeconds = probe.durationSeconds;
          }
          await this.patch(organizationId, runId, operationId, scene.id, stageName, { state: 'ready', assetId: found.id }, actualDurationSeconds);
          ({ config } = await this.store.fence(organizationId, runId, operationId));
          continue;
        }
        const line = pipeline.quote.items.find((item) => item.sceneId === scene.id && item.stage === stageName && item.attempt === stage.attempt);
        if (!line) throw new ConflictException('No accepted quote exists for this stage attempt.');
        await this.planning.assertDraftAssetsAuthorized(organizationId, brandId, { ...config.draft, identity: saved.identity });
        if (JSON.stringify(saved.referenceAssetIds) !== JSON.stringify(config.draft.references.map((reference) => reference.assetId))) throw new ConflictException('Accepted references changed.');
        const claimToken = randomUUID();
        await this.patch(organizationId, runId, operationId, scene.id, stageName, { state: 'claimed', claimedAt: new Date().toISOString(), claimToken });
        const onPlaceholderCreated = async (assetId: string) => { await this.patch(organizationId, runId, operationId, scene.id as string, stageName, { assetId }); };
        const output = config.draft.output;
        if (!('aspectRatio' in output)) throw new ConflictException('Missing scene aspect ratio.');
        const user: AuthenticatedUser = { id: pipeline.operation.userId, userId: pipeline.operation.userId, organizationId, brandId };
        if (stageName === 'image') {
          const sourceActionId = this.billing.key(runId, line);
          const request = { user, body: { sourceActionId }, creditsConfig: { deferred: true } } as RequestWithContext & DeferredCreditsRequest;
          const references: ImageGenerationBriefReference[] = config.draft.references.flatMap(({ assetId, role, description }) => role === 'first_frame' || role === 'last_frame' || role === 'reference_video' ? [] : [{ assetId, role, description }]);
          references.push({ assetId: saved.identity.avatarAssetId, role: 'character', description: 'Preserve the selected saved brand persona.' });
          const dimensions = resolveAgentGenerationDimensions(output.aspectRatio, DEFAULT_AGENT_IMAGE_ASPECT_RATIO);
          const response = await this.images.generateImage(user, { brandId, sourceActionId, model: MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2, autoSelectModel: false, ...dimensions, outputs: 1, fidelityMode: 'guided', brandingMode: 'brand', isBrandingEnabled: true, waitForCompletion: false, references: references.map((reference) => reference.assetId), text: `Create a new original brand ad scene. ${scene.visualIntent}\nPreserve selected identity and authorized products. No source footage, text, watermarks, or competitor identity.`, } as CreateImageDto, request, onPlaceholderCreated, { groupId, groupIndex: 0, settleCreditsExternally: true }, async () => {
            const credits = request.creditsConfig;
            if (!credits || (credits.isByokBypass ? 0 : credits.amount) !== line.credits || Boolean(credits.isByokBypass) !== (line.billingMode === 'byok') || (line.credits > 0 && !credits.reservationId)) throw new ConflictException('Image billing changed after the accepted quote.');
            await this.billing.reserve(organizationId, runId, operationId, line, credits.reservationId);
          }, references);
          if (!response.data?.id) throw new ConflictException('Image provider returned no durable asset.');
          await this.billing.settle(organizationId, runId, operationId, line, line.credits > 0);
          await this.patch(organizationId, runId, operationId, scene.id, stageName, { assetId: response.data.id, state: 'submitted' });
        } else {
          if (!saved.image.assetId || saved.image.state !== 'ready') throw new ConflictException('The generated scene still is not ready.');
          const still = await this.asset(organizationId, brandId, saved.image.assetId, this.group(runId, scene.id, 'image', saved.image.attempt), 'IMAGE');
          if (!['GENERATED', 'VALIDATED'].includes(still.status ?? '')) throw new ConflictException('The generated scene still is no longer ready.');
          const photoUrl = readIngredientMediaUrl(still) ?? (still.s3Key ? this.mediaUrls.buildUrl(still.s3Key) : undefined);
          if (!photoUrl) throw new ConflictException('Generated scene still has no usable media URL.');
          const result = await this.avatars.generateAvatarVideo({ aspectRatio: remixAvatarAspectRatio(output.aspectRatio), clonedVoiceId: saved.identity.speechVoiceId, photoIngredientId: still.id, photoUrl, text: scene.narration ?? '' }, { organizationId, brandId, userId: user.userId }, onPlaceholderCreated, { groupId, groupIndex: 0, settleCreditsExternally: true, isByokBypass: line.billingMode === 'byok' }, async () => { await this.billing.reserve(organizationId, runId, operationId, line); });
          await this.billing.settle(organizationId, runId, operationId, line);
          await this.patch(organizationId, runId, operationId, scene.id, stageName, { assetId: result.ingredientId, state: 'submitted' });
        }
        return false;
      }
    }
    return true;
  }
  private async patch(organizationId: string, runId: string, operationId: string, sceneId: string, stage: 'image' | 'video', patch: Partial<BrandRemixScenePipeline['scenes'][string]['image']>, actualDurationSeconds?: number) {
    const { config } = await this.store.fence(organizationId, runId, operationId);
    const pipeline = config.scenePipeline;
    const scene = pipeline?.scenes[sceneId];
    if (!pipeline || !scene) throw new ConflictException('Scene was removed.');
    await this.store.save(organizationId, runId, config, { ...config, scenePipeline: { ...pipeline, scenes: { ...pipeline.scenes, [sceneId]: { ...scene, [stage]: { ...scene[stage], ...patch }, ...(actualDurationSeconds ? { actualDurationSeconds } : {}) } } } });
  }
}
