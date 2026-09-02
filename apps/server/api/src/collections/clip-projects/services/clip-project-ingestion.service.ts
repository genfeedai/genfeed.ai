import { createHash } from 'node:crypto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { AnalyzeYoutubeDto } from '@api/collections/clip-projects/dto/analyze-youtube.dto';
import type { CreateClipProjectFromYoutubeDto } from '@api/collections/clip-projects/dto/create-clip-project-from-youtube.dto';
import {
  MAX_CLIP_SOURCE_SIZE_BYTES,
  type PrepareClipUploadDto,
} from '@api/collections/clip-projects/dto/prepare-clip-upload.dto';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { ClipAnalysisWorkflowQueueService } from '@api/collections/clip-projects/services/clip-analysis-workflow-queue.service';
import { ClipFactoryWorkflowQueueService } from '@api/collections/clip-projects/services/clip-factory-workflow-queue.service';
import { ClipGenerationRequestService } from '@api/collections/clip-projects/services/clip-generation-request.service';
import { ClipIdentityResolutionService } from '@api/collections/clip-projects/services/clip-identity-resolution.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import { CLIP_SOURCE_MAX_DURATION_SECONDS } from '@genfeedai/constants';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { AgentClipRunIdentity } from '@genfeedai/interfaces';
import {
  CLIP_SOURCE_SCHEMA_VERSION,
  type ClipProcessingFlow,
  type ClipSourceContract,
  DEFAULT_CLIP_RESULT_MODE,
} from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

const DEFAULT_CLIP_SOURCE_MAX_RETRIES = 3;

export interface ClipProjectAnalysisResult {
  identity: AgentClipRunIdentity;
  projectId: string;
  status: string;
}

export interface ClipProjectIngestionResult {
  batchJobId: string;
  estimatedClips: number;
  identity?: AgentClipRunIdentity;
  projectId: string;
  status: string;
}

export interface PrepareClipUploadResult {
  expiresIn: number;
  ingredientId: string;
  projectId: string;
  publicUrl: string;
  uploadUrl: string;
}

@Injectable()
export class ClipProjectIngestionService {
  constructor(
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipFactoryWorkflowQueue: ClipFactoryWorkflowQueueService,
    private readonly clipAnalysisWorkflowQueue: ClipAnalysisWorkflowQueueService,
    private readonly clipGenerationRequestService: ClipGenerationRequestService,
    private readonly clipIdentityResolutionService: ClipIdentityResolutionService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly ingredientsService: IngredientsService,
    private readonly presignedUploadService: PresignedUploadService,
  ) {}

  async createFromYoutube(
    user: User,
    dto: CreateClipProjectFromYoutubeDto,
  ): Promise<ClipProjectIngestionResult> {
    const orgId = user.organizationId;
    const userId = user.userId ?? user.id;
    const estimatedClips = dto.maxClips ?? 10;
    const mode = dto.mode ?? DEFAULT_CLIP_RESULT_MODE;
    const provider = dto.avatarProvider ?? 'heygen';
    const identity = await this.resolveBrandAndIdentity({
      avatarId: dto.avatarId,
      avatarProvider: dto.avatarProvider,
      brandId: dto.brandId,
      mode,
      organizationId: orgId,
      provider,
      voiceId: dto.voiceId,
    });
    const runReferences = dto.brandId
      ? await this.clipGenerationRequestService.resolveRunReferences(
          dto.brandId,
          orgId,
        )
      : [];
    this.clipGenerationRequestService.assertProviderRequirements(
      provider,
      {},
      runReferences,
      mode,
    );

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        orgId,
        estimatedClips,
      );

    if (!hasCredits) {
      const currentBalance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(orgId);
      throw new InsufficientCreditsException(estimatedClips, currentBalance);
    }

    const source = this.buildYoutubeSource(dto.youtubeUrl, 'quick');
    const project: ClipProjectDocument = await this.clipProjectsService.create({
      brandId: dto.brandId,
      language: dto.language ?? 'en',
      name:
        dto.name ??
        `YouTube Clip Factory — ${new Date().toISOString().slice(0, 10)}`,
      organizationId: orgId,
      settings: {
        addCaptions: true,
        aspectRatio: '9:16',
        avatarId: identity?.avatarId,
        avatarProvider: provider,
        captionStyle: 'default',
        flow: 'quick',
        language: dto.language ?? 'en',
        maxClips: estimatedClips,
        maxDuration: 90,
        minDuration: 15,
        minViralityScore: dto.minViralityScore ?? 50,
        mode,
        voiceId: identity?.voiceId,
      },
      sourceVideoUrl: dto.youtubeUrl,
      source,
      userId,
    });

    const projectId = String(project.id);
    const queuedSource = this.withJobId(source, `clip-factory-${projectId}`);
    await this.clipProjectsService.patch(
      projectId,
      { source: queuedSource },
      [],
      orgId,
    );
    const batchJobId = await this.clipFactoryWorkflowQueue.enqueue({
      avatarId: identity?.avatarId,
      avatarProvider: provider,
      language: dto.language ?? 'en',
      maxClips: estimatedClips,
      minViralityScore: dto.minViralityScore ?? 50,
      mode,
      orgId,
      projectId,
      runReferences,
      userId,
      voiceId: identity?.voiceId,
      youtubeUrl: dto.youtubeUrl,
      source: queuedSource,
    });

    return {
      batchJobId,
      estimatedClips,
      identity,
      projectId,
      status: 'processing',
    };
  }

  async analyzeYoutube(
    user: User,
    dto: AnalyzeYoutubeDto,
  ): Promise<ClipProjectAnalysisResult> {
    const orgId = user.organizationId;
    const userId = user.userId ?? user.id;
    const identity = await this.clipIdentityResolutionService.resolve({
      brandId: dto.brandId,
      organizationId: orgId,
    });

    const source = this.buildYoutubeSource(dto.youtubeUrl, 'review');
    const project: ClipProjectDocument = await this.clipProjectsService.create({
      brandId: dto.brandId,
      language: dto.language ?? 'en',
      name:
        dto.name ?? `Clip Analysis — ${new Date().toISOString().slice(0, 10)}`,
      organizationId: orgId,
      settings: {
        addCaptions: true,
        aspectRatio: '9:16',
        captionStyle: 'default',
        flow: 'review',
        language: dto.language ?? 'en',
        maxClips: dto.maxClips ?? 10,
        maxDuration: 90,
        minDuration: 15,
        minViralityScore: dto.minViralityScore ?? 50,
        mode: DEFAULT_CLIP_RESULT_MODE,
      },
      sourceVideoUrl: dto.youtubeUrl,
      source,
      status: 'pending',
      userId,
    });

    const projectId = String(project.id);
    const queuedSource = this.withJobId(source, `clip-analysis-${projectId}`);
    await this.clipProjectsService.patch(
      projectId,
      { source: queuedSource },
      [],
      orgId,
    );

    await this.clipAnalysisWorkflowQueue.enqueue({
      language: dto.language ?? 'en',
      maxClips: dto.maxClips ?? 10,
      minViralityScore: dto.minViralityScore ?? 50,
      orgId,
      projectId,
      userId,
      youtubeUrl: dto.youtubeUrl,
      source: queuedSource,
    });

    return { identity, projectId, status: 'analyzing' };
  }

  async prepareUpload(
    user: User,
    dto: PrepareClipUploadDto,
  ): Promise<PrepareClipUploadResult> {
    const userId = user.userId ?? user.id;
    const flow = dto.flow ?? 'quick';
    const mode = dto.mode ?? DEFAULT_CLIP_RESULT_MODE;

    if (dto.contentType.startsWith('audio/') && mode === 'raw-cut') {
      throw new BadRequestException(
        'Audio sources require avatar mode because raw-cut clips need source video.',
      );
    }

    const upload = await this.presignedUploadService.getPresignedUploadUrl(
      user,
      {
        category: dto.contentType.startsWith('audio/')
          ? IngredientCategory.VOICE
          : IngredientCategory.VIDEO,
        contentType: dto.contentType,
        filename: dto.filename,
      },
    );
    const now = new Date().toISOString();
    const source: ClipSourceContract = {
      artifact: {
        contentType: dto.contentType,
        mediaUrl: upload.publicUrl,
        storageKey: upload.s3Key,
      },
      contentType: dto.contentType,
      filename: dto.filename,
      fingerprint: this.hashSource(
        `${upload.id}:${dto.filename}:${dto.sizeBytes}:${dto.contentType}`,
      ),
      flow,
      ingredientId: upload.id,
      kind: 'upload',
      maxRetries: DEFAULT_CLIP_SOURCE_MAX_RETRIES,
      retryCount: 0,
      schemaVersion: CLIP_SOURCE_SCHEMA_VERSION,
      sizeBytes: dto.sizeBytes,
      status: 'uploading',
      updatedAt: now,
    };

    const project = await this.clipProjectsService.create({
      brandId: dto.brandId,
      language: dto.language ?? 'en',
      name: dto.name ?? `Uploaded Clip Source — ${now.slice(0, 10)}`,
      organizationId: user.organizationId,
      settings: {
        addCaptions: true,
        aspectRatio: '9:16',
        avatarId: dto.avatarId,
        avatarProvider: dto.avatarProvider,
        captionStyle: 'default',
        flow,
        language: dto.language ?? 'en',
        maxClips: dto.maxClips ?? 10,
        maxDuration: 90,
        minDuration: 15,
        minViralityScore: dto.minViralityScore ?? 50,
        mode,
        voiceId: dto.voiceId,
      },
      source,
      sourceVideoS3Key: upload.s3Key,
      sourceVideoUrl: upload.publicUrl,
      status: 'pending',
      userId,
    });

    return {
      expiresIn: upload.expiresIn,
      ingredientId: upload.id,
      projectId: String(project.id),
      publicUrl: upload.publicUrl,
      uploadUrl: upload.uploadUrl,
    };
  }

  async finalizeUpload(
    user: User,
    projectId: string,
  ): Promise<ClipProjectIngestionResult> {
    const project = await this.findAuthorizedProject(user, projectId);
    const source = project.source;

    if (source?.kind !== 'upload' || !source.ingredientId) {
      throw new BadRequestException(
        'This clip project does not have a pending uploaded source.',
      );
    }

    if (
      source.jobId &&
      source.status !== 'uploading' &&
      source.status !== 'validating'
    ) {
      return {
        batchJobId: source.jobId,
        estimatedClips: project.settings?.maxClips ?? 10,
        projectId,
        status: source.status,
      };
    }

    let ingredient = await this.ingredientsService.findOne(
      {
        id: source.ingredientId,
        isDeleted: false,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      },
      [{ path: 'metadata' }],
    );

    if (!ingredient) {
      throw new NotFoundException('Ingredient', source.ingredientId);
    }

    if (String(ingredient.status) === IngredientStatus.PROCESSING) {
      await this.presignedUploadService.confirmUpload(
        user,
        source.ingredientId,
      );
      ingredient = await this.ingredientsService.findOne(
        {
          id: source.ingredientId,
          isDeleted: false,
          organizationId: user.organizationId,
          userId: user.userId ?? user.id,
        },
        [{ path: 'metadata' }],
      );
    }

    if (
      !ingredient ||
      String(ingredient.status) !== IngredientStatus.UPLOADED
    ) {
      throw new BadRequestException('The clip source upload is not ready.');
    }

    const durationSeconds = ingredient.metadata?.duration;
    const sizeBytes = ingredient.metadata?.size;
    if (
      typeof sizeBytes !== 'number' ||
      !Number.isFinite(sizeBytes) ||
      sizeBytes <= 0
    ) {
      throw new BadRequestException(
        'The uploaded clip source size is unavailable.',
      );
    }
    if (
      typeof durationSeconds !== 'number' ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    ) {
      throw new BadRequestException(
        'The uploaded clip source duration is unavailable.',
      );
    }
    if (sizeBytes > MAX_CLIP_SOURCE_SIZE_BYTES) {
      throw new BadRequestException('Clip sources may be up to 10 GB.');
    }
    if (!/^(audio|video)\//.test(String(ingredient.mimeType))) {
      throw new BadRequestException(
        'The uploaded clip source is not supported audio or video media.',
      );
    }
    if (durationSeconds > CLIP_SOURCE_MAX_DURATION_SECONDS) {
      throw new BadRequestException('Clip sources may be up to 6 hours long.');
    }

    const flow = project.settings?.flow ?? source.flow;
    const expectedJobId = `${flow === 'review' ? 'clip-analysis' : 'clip-factory'}-${projectId}`;
    const queuedSource: ClipSourceContract = {
      ...source,
      durationSeconds,
      failure: null,
      jobId: expectedJobId,
      sizeBytes,
      status: 'queued',
      updatedAt: new Date().toISOString(),
    };
    return await this.enqueueUploadedProject(user, project, queuedSource);
  }

  async retrySource(
    user: User,
    projectId: string,
  ): Promise<ClipProjectIngestionResult> {
    const project = await this.findAuthorizedProject(user, projectId);
    const source = project.source;

    if (!source?.jobId || source.status !== 'failed') {
      throw new BadRequestException(
        'Only a failed clip source job can be retried.',
      );
    }
    if (source.retryCount >= source.maxRetries) {
      throw new BadRequestException('The clip source retry limit was reached.');
    }

    const nextSource: ClipSourceContract = {
      ...source,
      failure: null,
      retryCount: source.retryCount + 1,
      status: 'queued',
      updatedAt: new Date().toISOString(),
    };
    const flow = project.settings?.flow ?? source.flow;
    const sourceUrl = project.sourceVideoUrl ?? nextSource.artifact?.mediaUrl;
    if (!sourceUrl) {
      throw new BadRequestException('The clip source URL is unavailable.');
    }
    const batchJobId =
      flow === 'review'
        ? await this.clipAnalysisWorkflowQueue.enqueue({
            language: project.settings?.language ?? project.language ?? 'en',
            maxClips: project.settings?.maxClips ?? 10,
            minViralityScore: project.settings?.minViralityScore ?? 50,
            orgId: user.organizationId,
            projectId,
            source: nextSource,
            userId: user.userId ?? user.id,
            youtubeUrl: sourceUrl,
          })
        : (await this.enqueueUploadedProject(user, project, nextSource))
            .batchJobId;

    await this.clipProjectsService.patch(
      projectId,
      {
        error: null,
        source: nextSource,
        status: 'pending',
      },
      [],
      user.organizationId,
    );

    return {
      batchJobId,
      estimatedClips: project.settings?.maxClips ?? 10,
      projectId,
      status: 'queued',
    };
  }

  private async enqueueUploadedProject(
    user: User,
    project: ClipProjectDocument,
    source: ClipSourceContract,
  ): Promise<ClipProjectIngestionResult> {
    const projectId = String(project.id);
    const settings = project.settings ?? {};
    const estimatedClips = settings.maxClips ?? 10;
    const flow: ClipProcessingFlow = settings.flow ?? source.flow;
    const sourceUrl = project.sourceVideoUrl ?? source.artifact?.mediaUrl;
    const userId = user.userId ?? user.id;

    if (!sourceUrl) {
      throw new BadRequestException('The clip source URL is unavailable.');
    }

    if (flow === 'review') {
      await this.clipProjectsService.patch(
        projectId,
        { source },
        [],
        user.organizationId,
      );
      const batchJobId = await this.clipAnalysisWorkflowQueue.enqueue({
        language: settings.language ?? project.language ?? 'en',
        maxClips: estimatedClips,
        minViralityScore: settings.minViralityScore ?? 50,
        orgId: user.organizationId,
        projectId,
        source,
        userId,
        youtubeUrl: sourceUrl,
      });
      return {
        batchJobId,
        estimatedClips,
        projectId,
        status: 'analyzing',
      };
    }

    const mode = settings.mode ?? DEFAULT_CLIP_RESULT_MODE;
    const provider = settings.avatarProvider ?? 'heygen';
    const identity = await this.resolveBrandAndIdentity({
      avatarId: settings.avatarId,
      avatarProvider: settings.avatarProvider,
      brandId: project.brandId ?? undefined,
      mode,
      organizationId: user.organizationId,
      provider,
      voiceId: settings.voiceId,
    });

    const runReferences = project.brandId
      ? await this.clipGenerationRequestService.resolveRunReferences(
          project.brandId,
          user.organizationId,
        )
      : [];
    const reference = this.clipGenerationRequestService.resolveProjectReference(
      {
        mode,
        project,
        provider,
      },
    );
    this.clipGenerationRequestService.assertProviderRequirements(
      provider,
      reference,
      runReferences,
      mode,
    );
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        user.organizationId,
        estimatedClips,
      );
    if (!hasCredits) {
      const currentBalance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          user.organizationId,
        );
      throw new InsufficientCreditsException(estimatedClips, currentBalance);
    }

    await this.clipProjectsService.patch(
      projectId,
      { source },
      [],
      user.organizationId,
    );

    const batchJobId = await this.clipFactoryWorkflowQueue.enqueue({
      avatarId: identity?.avatarId,
      avatarProvider: provider,
      language: settings.language ?? project.language ?? 'en',
      maxClips: estimatedClips,
      minViralityScore: settings.minViralityScore ?? 50,
      mode,
      orgId: user.organizationId,
      projectId,
      referenceImageUrl: reference.referenceImageUrl,
      runReferences,
      source,
      userId,
      voiceId: identity?.voiceId,
      youtubeUrl: sourceUrl,
    });

    return {
      batchJobId,
      estimatedClips,
      identity,
      projectId,
      status: 'processing',
    };
  }

  private async findAuthorizedProject(
    user: User,
    projectId: string,
  ): Promise<ClipProjectDocument> {
    const project = await this.clipProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId: user.organizationId,
    });
    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }
    return project;
  }

  private buildYoutubeSource(
    youtubeUrl: string,
    flow: ClipProcessingFlow,
  ): ClipSourceContract {
    return {
      fingerprint: this.hashSource(youtubeUrl),
      flow,
      kind: 'youtube',
      maxRetries: DEFAULT_CLIP_SOURCE_MAX_RETRIES,
      retryCount: 0,
      schemaVersion: CLIP_SOURCE_SCHEMA_VERSION,
      status: 'queued',
      updatedAt: new Date().toISOString(),
    };
  }

  private withJobId(
    source: ClipSourceContract,
    jobId: string,
  ): ClipSourceContract {
    return {
      ...source,
      jobId,
      updatedAt: new Date().toISOString(),
    };
  }

  private hashSource(value: string): string {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
  }

  private needsAvatarIdentity(mode: string, provider: string): boolean {
    return mode === 'avatar' && provider !== 'genfeedai';
  }

  private async resolveBrandAndIdentity(input: {
    avatarId?: string;
    avatarProvider?: string;
    brandId?: string;
    mode: string;
    organizationId: string;
    provider: string;
    voiceId?: string;
  }): Promise<AgentClipRunIdentity | undefined> {
    const needsAvatar = this.needsAvatarIdentity(input.mode, input.provider);
    if (!needsAvatar && !input.brandId) {
      return undefined;
    }

    const resolved = await this.clipIdentityResolutionService.resolve({
      avatarId: input.avatarId,
      avatarProvider: input.avatarProvider,
      brandId: input.brandId,
      organizationId: input.organizationId,
      voiceId: input.voiceId,
    });

    if (!needsAvatar) {
      return undefined;
    }

    this.clipGenerationRequestService.assertCompleteAvatarIdentity(resolved);
    return resolved;
  }
}
