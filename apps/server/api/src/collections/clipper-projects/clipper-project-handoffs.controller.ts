import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  type ClipEditorHandoffResult,
  type ClipPublishHandoffResult,
  ClipperHandoffWorkflowService,
} from '@api/collections/clipper-projects/services/clipper-handoff-workflow.service';
import type { ClipperLibraryLinkResult } from '@api/collections/clipper-projects/services/clipper-library-link.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
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
@ApiTags('clipper-projects')
@ApiBearerAuth()
@FeatureFlag('clipper')
@OrganizationModule('clipper')
@Controller('clipper-projects')
@UseGuards(RolesGuard)
export class ClipperProjectHandoffsController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly handoffWorkflow: ClipperHandoffWorkflowService,
  ) {}

  @Post(':projectId/results/:clipperResultId/editor-handoff')
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
    @Param('clipperResultId') clipperResultId: string,
  ): Promise<ClipEditorHandoffResult> {
    return this.handoffWorkflow.createEditorHandoff(
      {
        ...(user.brandId ? { brandId: user.brandId } : {}),
        clipperResultId,
        projectId,
      },
      this.context(user),
    );
  }

  @Post(':projectId/results/:clipperResultId/publish-handoff')
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
    @Param('clipperResultId') clipperResultId: string,
  ): Promise<ClipPublishHandoffResult> {
    return this.handoffWorkflow.preparePublishHandoff(
      { clipperResultId, projectId },
      this.context(user),
    );
  }

  @Post(':projectId/results/:clipperResultId/library-link')
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
    @Param('clipperResultId') clipperResultId: string,
  ): Promise<ClipperLibraryLinkResult> {
    return this.handoffWorkflow.retryLibraryLink(
      { clipperResultId, projectId },
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
