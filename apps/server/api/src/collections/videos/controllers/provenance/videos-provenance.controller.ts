import { VideoProvenanceService } from '@api/collections/videos/services/video-provenance.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import type { User } from '@clerk/backend';
import type { IMediaProvenancePackage } from '@genfeedai/interfaces';
import { Controller, Get, Param, UseGuards } from '@nestjs/common';

/**
 * VideosProvenance Controller
 * Emits the canonical media provenance package for a video (issue #31):
 * - Stable asset ID
 * - Transcript sidecar with timestamps
 * - JSON manifest with canonical URLs + generation metadata
 */
@AutoSwagger()
@Controller('videos')
@UseGuards(RolesGuard)
export class VideosProvenanceController {
  constructor(
    private readonly videoProvenanceService: VideoProvenanceService,
  ) {}

  @Get(':videoId/provenance')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getProvenance(
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
  ): Promise<{ data: IMediaProvenancePackage }> {
    const publicMetadata = getPublicMetadata(user);

    const data = await this.videoProvenanceService.buildProvenance(videoId, {
      organizationId: publicMetadata.organization,
      userId: publicMetadata.user,
    });

    return { data };
  }
}
