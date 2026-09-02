import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  type ClipEditorHandoffResult,
  ClipHandoffWorkflowService,
  type ClipPublishHandoffResult,
} from '@api/collections/clip-projects/services/clip-handoff-workflow.service';
import type { ClipLibraryLinkResult } from '@api/collections/clip-projects/services/clip-library-link.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Controller,
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
export class ClipProjectHandoffsController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly handoffWorkflow: ClipHandoffWorkflowService,
  ) {}

  @Post(':projectId/results/:clipResultId/editor-handoff')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Validate a ready clip result and create an editor project handoff from its terminal media URL.',
    summary: 'Create editor handoff for a ready clip result',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createEditorHandoff(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('clipResultId') clipResultId: string,
  ): Promise<ClipEditorHandoffResult> {
    return this.handoffWorkflow.createEditorHandoff(
      {
        ...(user.brandId ? { brandId: user.brandId } : {}),
        clipResultId,
        projectId,
      },
      this.context(user),
    );
  }

  @Post(':projectId/results/:clipResultId/publish-handoff')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Validate a ready clip result and prepare a user-confirmed publish handoff payload.',
    summary: 'Prepare publish handoff for a ready clip result',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createPublishHandoff(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('clipResultId') clipResultId: string,
  ): Promise<ClipPublishHandoffResult> {
    return this.handoffWorkflow.preparePublishHandoff(
      { clipResultId, projectId },
      this.context(user),
    );
  }

  @Post(':projectId/results/:clipResultId/library-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Retry Library linking for a ready clip without re-rendering or rebilling.',
    summary: 'Retry Library link for a ready clip result',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async retryLibraryLink(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('clipResultId') clipResultId: string,
  ): Promise<ClipLibraryLinkResult> {
    return this.handoffWorkflow.retryLibraryLink(
      { clipResultId, projectId },
      this.context(user),
    );
  }

  private context(user: User): { organizationId: string; userId: string } {
    return {
      organizationId: user.organizationId,
      userId: user.userId ?? user.id,
    };
  }
}
