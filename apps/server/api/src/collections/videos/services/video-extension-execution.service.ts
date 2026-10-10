import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import type { VideoExtendDto } from '@api/collections/videos/dto/video-extend.dto';
import { hasNativeExtend } from '@genfeedai/contracts/constants';
import { bindSeedanceVideoReferences, measuredSeedanceVideoReference, seedanceVideoReferenceLimit } from '@api/collections/videos/services/seedance-reference-evidence.util';
import { PLAYGROUND_FABRICATED_EXTEND_WORKFLOW_ID, PLAYGROUND_NATIVE_EXTEND_WORKFLOW_ID } from '@api/collections/workflows/services/playground-extend-workflow-definition';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { SYSTEM_WORKFLOW_RUNNER } from '@api/collections/workflows/workflows.tokens';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { IngredientCategory, IngredientOrigin, IngredientStatus, MetadataExtension, ModelProvider } from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { platformOrTenantScope } from '@libs/prisma/platform-scope';
import { ConfigService } from '@libs/config/config.service';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

/** Source preparation is internal file work; provider funding belongs only to the queued execution. */
@Injectable()
export class VideoExtensionExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandAccess: BrandAccessService,
    private readonly personas: PersonasService,
    private readonly files: FilesClientService,
    private readonly shared: SharedService,
    private readonly media: WebhooksService,
    private readonly config: ConfigService,
    @Inject(SYSTEM_WORKFLOW_RUNNER) private readonly runner: SystemWorkflowRunnerService,
  ) {}

  async enqueue(user: AuthenticatedUser, sourceId: string, dto: VideoExtendDto) {
    const actorUserId = user.userId ?? user.id;
    const source = await this.prisma.ingredient.findFirst({ where: { id: sourceId, organizationId: user.organizationId, isDeleted: false, category: IngredientCategory.VIDEO, status: { in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED] } } });
    if (!source?.s3Key || !source.brandId) throw new BadRequestException('A stored completed video and source brand are required to extend');
    await this.brandAccess.assert({ ...user, userId: actorUserId }, source.brandId);
    await this.personas.resolveCharacterReferences({ brandId: source.brandId, ingredientIds: [sourceId], organizationId: user.organizationId, path: 'video-extend' });
    const model = await this.prisma.model.findFirst({ where: { key: dto.model, isActive: true, isDeleted: false, ...platformOrTenantScope(user.organizationId) } });
    if (!model) throw new BadRequestException('The extension model is unavailable');
    const sourceUrl = await this.files.getPresignedDownloadUrlForObjectKey(source.s3Key);
    const before = await this.files.fingerprintMedia(sourceUrl);
    const probe = await this.files.probeMediaFromUrl(sourceUrl, 'video');
    const after = await this.files.fingerprintMedia(sourceUrl);
    if (before.assetHash !== after.assetHash || before.sizeBytes !== after.sizeBytes || probe.sizeBytes !== after.sizeBytes || !probe.durationSeconds || probe.durationSeconds <= 0) throw new BadRequestException('The video source changed or has no readable duration');
    const sourceEvidence = { assetId: sourceId, sourceKey: source.s3Key, sourceVersion: after.assetHash, sizeBytes: after.sizeBytes };
    const canonicalSourceUrl = `${this.config.ingredientsEndpoint}/videos/${sourceId}`;
    const native = hasNativeExtend(dto.model) || (model.provider === ModelProvider.FAL && /^bytedance\/seedance-2\.5\/(?:us\/)?reference-to-video$/.test(model.endpoint ?? ''));
    if (native && (!Number.isSafeInteger(dto.duration ?? 8) || (dto.duration ?? 8) < 4 || (dto.duration ?? 8) > 30)) throw new BadRequestException('Native extension duration must be between 4 and 30 seconds');
    if (hasNativeExtend(dto.model) && (probe.durationSeconds < 1 || probe.durationSeconds > 30)) throw new BadRequestException('Seedance native extension requires a measured source video between 1 and 30 seconds');
    if (model.provider === ModelProvider.FAL && seedanceVideoReferenceLimit(model.endpoint ?? '')) {
      bindSeedanceVideoReferences(model.endpoint ?? '', user.organizationId, [measuredSeedanceVideoReference({ assetId: sourceId, organizationId: user.organizationId, sourceKey: source.s3Key, url: sourceUrl, before, probe, after })]);
    }
    let frameIngredientId: string | undefined;
    let image: string | undefined;
    let frameEvidence: Record<string, string | number> | undefined;
    if (!native) {
      const frameUrl: unknown = await this.files.generateThumbnail(sourceUrl, sourceId, Math.max(0, probe.durationSeconds - 0.05));
      if (typeof frameUrl !== 'string' || !frameUrl) throw new BadRequestException('The source last frame could not be extracted');
      const { ingredientData } = await this.shared.createMediaDocumentsInternal({ brandId: source.brandId, organizationId: user.organizationId, userId: actorUserId, category: IngredientCategory.IMAGE, extension: MetadataExtension.JPG, origin: IngredientOrigin.GENERATED, status: IngredientStatus.PROCESSING, parentId: sourceId, sourceIds: [sourceId], generationSource: 'video-extension:last-frame', providerData: { sourceEvidence, timestampSeconds: Math.max(0, probe.durationSeconds - 0.05) } });
      frameIngredientId = ingredientData.id.toString();
      try {
        await this.media.processMediaForIngredient(frameIngredientId, IngredientCategory.IMAGE, frameUrl);
      } catch (error: unknown) {
        await this.prisma.ingredient.updateMany({ where: { id: frameIngredientId, organizationId: user.organizationId, brandId: source.brandId, parentId: sourceId, isDeleted: false, status: IngredientStatus.PROCESSING }, data: { status: IngredientStatus.FAILED } });
        throw error;
      }
      const storedFrame = await this.prisma.ingredient.findFirst({ where: { id: frameIngredientId, organizationId: user.organizationId, brandId: source.brandId, isDeleted: false, category: IngredientCategory.IMAGE, parentId: sourceId, status: { in: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED] } } });
      if (!storedFrame?.s3Key) throw new BadRequestException('The extracted last frame has not been stored');
      const storedFrameUrl = await this.files.getPresignedDownloadUrlForObjectKey(storedFrame.s3Key);
      const frameFingerprint = await this.files.fingerprintMedia(storedFrameUrl);
      frameEvidence = { assetId: frameIngredientId, sourceKey: storedFrame.s3Key, sourceVersion: frameFingerprint.assetHash, sizeBytes: frameFingerprint.sizeBytes };
      image = `${this.config.ingredientsEndpoint}/images/${frameIngredientId}`;
    }
    return this.runner.enqueueWorkflow({
      canonicalId: native ? PLAYGROUND_NATIVE_EXTEND_WORKFLOW_ID : PLAYGROUND_FABRICATED_EXTEND_WORKFLOW_ID,
      actionType: 'video.extend', source: 'VideosExtendController', organizationId: user.organizationId, userId: actorUserId,
      ...(user.apiKeyId ? { apiKeyId: user.apiKeyId, actorScopes: user.scopes ?? [] } : {}),
      inputValues: { brandId: source.brandId, model: dto.model, prompt: dto.prompt, duration: dto.duration ?? 8, parentIngredientId: sourceId, sourceEvidence: { ...sourceEvidence, ...(frameEvidence ? { frame: frameEvidence } : {}) }, ...(native ? { videoReference: canonicalSourceUrl, task: 'extension' } : { image, frameIngredientId, sourceVideo: { video: canonicalSourceUrl }, parentId: sourceId }) },
      metadata: { actionVerb: 'extend', dispatchMode: native ? 'native' : 'fabricated', sourceVideoId: sourceId, ...(frameIngredientId ? { frameIngredientId } : {}) },
    }, { dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE });
  }
}
