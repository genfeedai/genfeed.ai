import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { RewriteHighlightDto } from '@api/collections/clipper-projects/dto/rewrite-highlight.dto';
import { HighlightRewriteService } from '@api/collections/clipper-projects/services/highlight-rewrite.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
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
@ApiTags('clipper-projects')
@ApiBearerAuth()
@FeatureFlag('clipper')
@OrganizationModule('clipper')
@Controller('clipper-projects')
@UseGuards(RolesGuard)
export class ClipperProjectHighlightsController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipperProjectsService: ClipperProjectsService,
    private readonly highlightRewriteService: HighlightRewriteService,
  ) {}

  @TenantReadPolicy('selected')
  @Get(':projectId/highlights')
  @ApiOperation({
    description:
      'Returns the highlights array from a ClipperProject after analysis.',
    operationId: 'ClipperProjectsController.getHighlights',
    summary: 'Get project highlights',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getHighlights(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ) {
    const readScope = resolveTenantReadScope(user);
    const project = await this.clipperProjectsService.findOne({
      id: projectId,
      isDeleted: false,
      organizationId: readScope.organizationId,
    });

    if (!project) {
      throw new NotFoundException('ClipperProject', projectId);
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
    operationId: 'ClipperProjectsController.rewriteHighlight',
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
