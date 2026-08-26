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
import { isTranscriptSegment } from '@api/collections/clip-projects/services/clip-srt.util';
import { HookClipApprovalService } from '@api/collections/clip-projects/services/hook-clip-approval.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
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
import {
  ClipProjectSerializer,
  serializeClipGenerationResult,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
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
        mode,
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
      status: result.queuedClipCount > 0 ? 'generating' : 'failed',
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
}
