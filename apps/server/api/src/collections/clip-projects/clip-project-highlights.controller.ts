import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { RewriteHighlightDto } from '@api/collections/clip-projects/dto/rewrite-highlight.dto';
import { HighlightRewriteService } from '@api/collections/clip-projects/services/highlight-rewrite.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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
export class ClipProjectHighlightsController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly highlightRewriteService: HighlightRewriteService,
  ) {}

  @Get(':projectId/highlights')
  @ApiOperation({
    description:
      'Returns the highlights array from a ClipProject after analysis.',
    operationId: 'ClipProjectsController.getHighlights',
    summary: 'Get project highlights',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getHighlights(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ) {
    const project = await this.clipProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId: user.organizationId,
    });

    if (!project) {
      throw new NotFoundException('ClipProject', projectId);
    }

    return {
      highlights: project.highlights || [],
      projectId: String(project.id),
      status: project.status,
    };
  }

  @Post(':projectId/highlights/:highlightId/rewrite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Rewrite a highlight script using AI to make it more viral for a specific platform and tone.',
    operationId: 'ClipProjectsController.rewriteHighlight',
    summary: 'Viral rewrite a highlight script',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  rewriteHighlight(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('highlightId') highlightId: string,
    @Body() dto: RewriteHighlightDto,
  ): Promise<{ rewrittenScript: string; originalScript: string }> {
    return this.highlightRewriteService.rewrite(
      projectId,
      highlightId,
      user.organizationId,
      dto.platform ?? 'tiktok',
      dto.tone ?? 'hook',
    );
  }
}
