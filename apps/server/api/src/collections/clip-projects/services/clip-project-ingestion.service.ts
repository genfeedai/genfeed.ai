import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { AnalyzeYoutubeDto } from '@api/collections/clip-projects/dto/analyze-youtube.dto';
import type { CreateClipProjectFromYoutubeDto } from '@api/collections/clip-projects/dto/create-clip-project-from-youtube.dto';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { ClipGenerationRequestService } from '@api/collections/clip-projects/services/clip-generation-request.service';
import { ClipIdentityResolutionService } from '@api/collections/clip-projects/services/clip-identity-resolution.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import { ClipAnalyzeQueueService } from '@api/queues/clip-analyze/clip-analyze.queue.service';
import { ClipFactoryQueueService } from '@api/queues/clip-factory/clip-factory-queue.service';
import type { AgentClipRunIdentity } from '@genfeedai/interfaces';
import { DEFAULT_CLIP_RESULT_MODE } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

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

@Injectable()
export class ClipProjectIngestionService {
  constructor(
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipFactoryQueueService: ClipFactoryQueueService,
    private readonly clipAnalyzeQueueService: ClipAnalyzeQueueService,
    private readonly clipGenerationRequestService: ClipGenerationRequestService,
    private readonly clipIdentityResolutionService: ClipIdentityResolutionService,
    private readonly creditsUtilsService: CreditsUtilsService,
  ) {}

  async createFromYoutube(
    user: User,
    dto: CreateClipProjectFromYoutubeDto,
  ): Promise<ClipProjectIngestionResult> {
    const orgId = user.organizationId;
    const userId = user.userId ?? user.id;
    const estimatedClips = dto.maxClips ?? 10;
    const mode = dto.mode ?? DEFAULT_CLIP_RESULT_MODE;
    const resolvedIdentity =
      mode === 'avatar' || dto.brandId
        ? await this.clipIdentityResolutionService.resolve({
            avatarId: dto.avatarId,
            avatarProvider: dto.avatarProvider,
            brandId: dto.brandId,
            organizationId: orgId,
            voiceId: dto.voiceId,
          })
        : undefined;
    const identity = mode === 'avatar' ? resolvedIdentity : undefined;

    this.clipGenerationRequestService.assertCompleteAvatarIdentity(identity);
    const runReferences = dto.brandId
      ? await this.clipGenerationRequestService.resolveRunReferences(
          dto.brandId,
          orgId,
        )
      : [];

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
        captionStyle: 'default',
        maxClips: estimatedClips,
        maxDuration: 90,
        minDuration: 15,
        mode,
      },
      sourceVideoUrl: dto.youtubeUrl,
      userId,
    });

    const projectId = String(project.id);
    const batchJobId = await this.clipFactoryQueueService.enqueue({
      avatarId: identity?.avatarId,
      avatarProvider: dto.avatarProvider ?? 'heygen',
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
        maxClips: dto.maxClips ?? 10,
        maxDuration: 90,
        minDuration: 15,
      },
      sourceVideoUrl: dto.youtubeUrl,
      status: 'pending',
      userId,
    });

    const projectId = String(project.id);

    await this.clipAnalyzeQueueService.enqueue({
      language: dto.language ?? 'en',
      maxClips: dto.maxClips ?? 10,
      minViralityScore: dto.minViralityScore ?? 50,
      orgId,
      projectId,
      userId,
      youtubeUrl: dto.youtubeUrl,
    });

    return { identity, projectId, status: 'analyzing' };
  }
}
