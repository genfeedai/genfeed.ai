import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { CreateClipProjectDto } from '@api/collections/clip-projects/dto/create-clip-project.dto';
import {
  GenerateClipsDto,
  SubmitHookClipDecisionDto,
} from '@api/collections/clip-projects/dto/generate-clips.dto';
import { UpdateClipProjectDto } from '@api/collections/clip-projects/dto/update-clip-project.dto';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { ClipGenerationService } from '@api/collections/clip-projects/services/clip-generation.service';
import { ClipGenerationRequestService } from '@api/collections/clip-projects/services/clip-generation-request.service';
import { ClipIdentityResolutionService } from '@api/collections/clip-projects/services/clip-identity-resolution.service';
import type { ResolvedClipReference } from '@api/collections/clip-projects/services/clip-reference-generation.util';
import { isTranscriptSegment } from '@api/collections/clip-projects/services/clip-srt.util';
import { HookClipApprovalService } from '@api/collections/clip-projects/services/hook-clip-approval.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { InsufficientCreditsException } from '@server/exceptions/business-logic.exception';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { customLabels } from '@server/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type {
  ClipReferenceApplication,
  HookClipApprovalStatus,
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  SortObject,
} from '@genfeedai/interfaces';
import { DEFAULT_CLIP_RESULT_MODE } from '@genfeedai/interfaces';
import {
  ClipProjectSerializer,
  serializeClipGenerationResult,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('clip-projects')
@ApiBearerAuth()
@Controller('clip-projects')
@UseGuards(RolesGuard)
export class ClipProjectsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipGenerationService: ClipGenerationService,
    private readonly clipGenerationRequestService: ClipGenerationRequestService,
    private readonly clipIdentityResolutionService: ClipIdentityResolutionService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly hookClipApprovalService: HookClipApprovalService,
    private readonly clipResultsService: ClipResultsService,
  ) {}

  @Post(':projectId/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Generate avatar or deterministic raw-cut video clips for selected highlights. Expensive step (N credits, one per clip).',
    summary: 'Generate clips from selected highlights',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateClips(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: GenerateClipsDto,
  ): Promise<{
    clipCount: number;
    clipResultIds: string[];
    reference?: ClipReferenceApplication;
    status: string;
  }> {
    const orgId = user.organizationId;
    const userId = user.userId ?? user.id;

    const {
      identity,
      mode,
      persistedHighlights,
      project,
      reference,
      runReferences,
      selectedHighlights: selectedEditedHighlights,
    } = await this.clipGenerationRequestService.prepare({
      dto,
      organizationId: orgId,
      projectId,
    });

    const hookApprovalRequired =
      mode === 'avatar' &&
      selectedEditedHighlights.length > 1 &&
      dto.hookApprovalRequired !== false;
    const initialCreditCount = hookApprovalRequired
      ? 1
      : selectedEditedHighlights.length;
    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        orgId,
        initialCreditCount,
      );
    if (!hasCredits) {
      const currentBalance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(orgId);
      throw new InsufficientCreditsException(
        initialCreditCount,
        currentBalance,
      );
    }

    await this.clipProjectsService.patch(projectId, {
      highlights: persistedHighlights,
      progress: 0,
      settings: {
        ...project.settings,
        avatarId: identity?.avatarId,
        avatarProvider: dto.avatarProvider ?? 'heygen',
        flow: 'review',
        mode,
        voiceId: identity?.voiceId,
      },
      status: 'generating',
    });

    const result = await this.clipGenerationService.generateClips({
      avatarId: identity?.avatarId,
      highlights: selectedEditedHighlights,
      hookApprovalRequired,
      mode,
      orgId,
      projectId,
      provider: dto.avatarProvider ?? 'heygen',
      ...(reference.referenceImageUrl
        ? { referenceImageUrl: reference.referenceImageUrl }
        : {}),
      ...(reference.application
        ? { referenceProvenance: reference.application.provenance }
        : {}),
      runReferences,
      sourceVideoS3Key: project.sourceVideoS3Key,
      sourceVideoUrl: project.sourceVideoUrl,
      transcriptSegments: Array.isArray(project.transcriptSegments)
        ? project.transcriptSegments.filter(isTranscriptSegment)
        : [],
      transcriptText: project.transcriptText,
      userId,
      voiceId: identity?.voiceId,
    });

    if (result.queuedClipCount === 0) {
      await this.clipProjectsService.patch(projectId, {
        error: 'Clip generation failed before any generation job was queued.',
        progress: 100,
        status: 'failed',
      });
    }

    return serializeClipGenerationResult({
      clipCount: selectedEditedHighlights.length,
      clipResultIds: result.clipResultIds,
      ...(reference.application ? { reference: reference.application } : {}),
      status:
        !result.awaitingHookApproval &&
        result.completedClipCount === result.queuedClipCount
          ? 'completed'
          : result.queuedClipCount > 0
            ? 'generating'
            : 'failed',
    });
  }

  @Post(':projectId/retry-failed')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Retry only failed clip results while preserving completed clips and their Library handoffs.',
    summary: 'Retry failed clip generations',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async retryFailedClips(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ): Promise<{
    clipCount: number;
    clipResultIds: string[];
    status: string;
  }> {
    const organizationId = user.organizationId;
    const project = await this.clipProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId,
    });
    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }

    const failedResults = (
      await this.clipResultsService.findByProject(projectId, organizationId)
    ).filter(
      (result) => result.status === 'failed' || result.status === 'degraded',
    );
    if (failedResults.length === 0) {
      throw new BadRequestException(
        'This project has no failed clips to retry.',
      );
    }

    const mode = project.settings?.mode ?? DEFAULT_CLIP_RESULT_MODE;
    const provider = project.settings?.avatarProvider ?? 'heygen';
    const identity =
      mode === 'avatar' && provider !== 'genfeedai'
        ? await this.clipIdentityResolutionService.resolve({
            avatarId: project.settings?.avatarId,
            avatarProvider: project.settings?.avatarProvider,
            brandId: project.brandId,
            organizationId,
            voiceId: project.settings?.voiceId,
          })
        : undefined;
    this.clipGenerationRequestService.assertCompleteAvatarIdentity(identity);

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        failedResults.length,
      );
    if (!hasCredits) {
      const currentBalance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        );
      throw new InsufficientCreditsException(
        failedResults.length,
        currentBalance,
      );
    }

    const runReferences = project.brandId
      ? await this.clipGenerationRequestService.resolveRunReferences(
          project.brandId,
          organizationId,
        )
      : [];
    const reference: ResolvedClipReference =
      mode === 'avatar'
        ? this.clipGenerationRequestService.resolveProjectReference({
            mode,
            project,
            provider,
          })
        : {};
    this.clipGenerationRequestService.assertProviderRequirements(
      provider,
      reference,
      runReferences,
      mode,
    );
    const invalidRange = failedResults.find(
      (result) =>
        typeof result.startTime !== 'number' ||
        !Number.isFinite(result.startTime) ||
        typeof result.endTime !== 'number' ||
        !Number.isFinite(result.endTime) ||
        result.endTime <= result.startTime,
    );
    if (invalidRange) {
      throw new BadRequestException(
        `Failed clip result ${String(invalidRange.id)} has an invalid source time range.`,
      );
    }
    const highlights = failedResults.map((result) => ({
      clip_type: this.readString(result.clipType) ?? 'highlight',
      end_time: result.endTime as number,
      start_time: result.startTime as number,
      summary: this.readString(result.summary) ?? '',
      tags: Array.isArray(result.tags)
        ? result.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      title: this.readString(result.title) ?? 'Clip',
      virality_score:
        typeof result.viralityScore === 'number' ? result.viralityScore : 0,
    }));

    const claimed = await this.clipProjectsService.claimFailedResultRetry(
      projectId,
      organizationId,
      failedResults.length,
    );
    if (!claimed) {
      throw new BadRequestException(
        'Failed clips are already being retried or the project is no longer retryable.',
      );
    }

    let generated: Awaited<ReturnType<ClipGenerationService['generateClips']>>;
    try {
      generated = await this.clipGenerationService.generateClips({
        avatarId: identity?.avatarId,
        highlights,
        hookApprovalRequired: false,
        mode,
        orgId: organizationId,
        projectId,
        provider,
        ...(reference.referenceImageUrl
          ? { referenceImageUrl: reference.referenceImageUrl }
          : {}),
        ...(reference.application
          ? { referenceProvenance: reference.application.provenance }
          : {}),
        runReferences,
        sourceVideoS3Key: project.sourceVideoS3Key,
        sourceVideoUrl: project.sourceVideoUrl,
        transcriptSegments: Array.isArray(project.transcriptSegments)
          ? project.transcriptSegments.filter(isTranscriptSegment)
          : [],
        transcriptText: project.transcriptText,
        userId: user.userId ?? user.id,
        voiceId: identity?.voiceId,
      });
    } catch (error: unknown) {
      await this.clipProjectsService.patch(
        projectId,
        {
          error: 'Failed clip retry dispatch did not complete.',
          failedClipCount: failedResults.length,
          pendingClipCount: 0,
          status: project.status,
        },
        [],
        organizationId,
      );
      throw error;
    }

    if (generated.clipResultIds.length > 0) {
      await Promise.all(
        failedResults.map((result) =>
          this.clipResultsService.patch(
            String(result.id),
            { isDeleted: true },
            [],
            organizationId,
          ),
        ),
      );
    }
    if (
      generated.queuedClipCount === 0 ||
      (!generated.awaitingHookApproval &&
        generated.completedClipCount === generated.queuedClipCount)
    ) {
      await this.clipProjectsService.reconcileTerminalState(
        projectId,
        organizationId,
      );
    }

    return serializeClipGenerationResult({
      clipCount: failedResults.length,
      clipResultIds: generated.clipResultIds,
      status:
        !generated.awaitingHookApproval &&
        generated.completedClipCount === generated.queuedClipCount
          ? 'completed'
          : generated.queuedClipCount > 0
            ? 'generating'
            : 'failed',
    });
  }

  @Get(':projectId/hook-approval')
  @ApiOperation({ summary: 'Get the trusted hook clip approval state' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getHookClipApproval(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ): Promise<{ data: HookClipApprovalStatus }> {
    const data = await this.hookClipApprovalService.getStatus(
      projectId,
      user.organizationId,
    );
    return { data };
  }

  @Post(':projectId/hook-approval')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve, regenerate, or reject the hook clip' })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async submitHookClipDecision(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: SubmitHookClipDecisionDto,
  ): Promise<{ data: HookClipApprovalStatus }> {
    const data = await this.hookClipApprovalService.submitDecision({
      action: dto.action,
      feedback: dto.feedback,
      organizationId: user.organizationId,
      projectId,
      userId: user.userId ?? user.id,
    });
    return { data };
  }

  @Post()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createDto: CreateClipProjectDto,
  ): Promise<JsonApiSingleResponse> {
    if (createDto.brandId) {
      await this.clipIdentityResolutionService.resolve({
        brandId: createDto.brandId,
        organizationId: user.organizationId,
      });
    }

    const data: ClipProjectDocument = await this.clipProjectsService.create({
      ...createDto,
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    });

    return serializeSingle(request, ClipProjectSerializer, data);
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const aggregate = {
      where: {
        isDeleted: false,
        organizationId: user.organizationId,
      },
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : ({ createdAt: -1 } as SortObject),
    };

    const data: AggregatePaginateResult<ClipProjectDocument> =
      await this.clipProjectsService.findAll(aggregate, options);
    return serializeCollection(request, ClipProjectSerializer, data);
  }

  @Get(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<JsonApiSingleResponse> {
    const hookApproval = await this.hookClipApprovalService.getStatus(
      id,
      user.organizationId,
    );
    const data = this.hookClipApprovalService.isProjectReconciliationBlocked(
      hookApproval,
    )
      ? await this.clipProjectsService.findOne({
          id,
          isDeleted: false,
          organizationId: user.organizationId,
        })
      : await this.clipProjectsService.reconcileTerminalState(
          id,
          user.organizationId,
        );

    if (!data) {
      return returnNotFound(this.constructorName, id);
    }

    return serializeSingle(request, ClipProjectSerializer, data);
  }

  @Patch(':id')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() updateDto: UpdateClipProjectDto,
  ): Promise<JsonApiSingleResponse> {
    const existing = await this.clipProjectsService.findOne({
      id: id,
      organizationId: user.organizationId,
    });

    if (!existing) {
      return returnNotFound(this.constructorName, id);
    }

    const data: ClipProjectDocument = await this.clipProjectsService.patch(
      id,
      updateDto,
    );

    return serializeSingle(request, ClipProjectSerializer, data);
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
