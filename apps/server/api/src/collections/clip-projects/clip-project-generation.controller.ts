import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  GenerateClipsDto,
  SubmitHookClipDecisionDto,
} from '@api/collections/clip-projects/dto/generate-clips.dto';
import { ClipGenerationDispatchService } from '@api/collections/clip-projects/services/clip-generation-dispatch.service';
import { HookClipApprovalService } from '@api/collections/clip-projects/services/hook-clip-approval.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type {
  ClipReferenceApplication,
  HookClipApprovalStatus,
} from '@genfeedai/interfaces';
import type { ClipGenerationResult } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@AutoSwagger()
@ApiTags('clip-projects')
@ApiBearerAuth()
@Controller('clip-projects')
@UseGuards(RolesGuard)
export class ClipProjectGenerationController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipGenerationDispatchService: ClipGenerationDispatchService,
    private readonly hookClipApprovalService: HookClipApprovalService,
  ) {}

  @Post(':projectId/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Generate avatar or deterministic raw-cut video clips for selected highlights. Expensive step (N credits, one per clip).',
    operationId: 'ClipProjectsController.generateClips',
    summary: 'Generate clips from selected highlights',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  generateClips(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: GenerateClipsDto,
  ): Promise<ClipGenerationResult<ClipReferenceApplication>> {
    return this.clipGenerationDispatchService.generateClips(
      user.organizationId,
      user.userId ?? user.id,
      projectId,
      dto,
    );
  }

  @Post(':projectId/retry-failed')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    description:
      'Retry only failed clip results while preserving completed clips and their Library handoffs.',
    operationId: 'ClipProjectsController.retryFailedClips',
    summary: 'Retry failed clip generations',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  retryFailedClips(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ): Promise<ClipGenerationResult<ClipReferenceApplication>> {
    return this.clipGenerationDispatchService.retryFailedClips(
      user.organizationId,
      user.userId ?? user.id,
      projectId,
    );
  }

  @Get(':projectId/hook-approval')
  @ApiOperation({
    operationId: 'ClipProjectsController.getHookClipApproval',
    summary: 'Get the trusted hook clip approval state',
  })
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
  @ApiOperation({
    operationId: 'ClipProjectsController.submitHookClipDecision',
    summary: 'Approve, regenerate, or reject the hook clip',
  })
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
}
