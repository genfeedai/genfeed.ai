import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { VideoProvenanceService } from '@api/collections/videos/services/video-provenance.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type {
  IMediaProvenancePackage,
  IMediaWatermarkAttributionEvaluation,
} from '@genfeedai/contracts/interfaces';
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

  @TenantReadPolicy('selected')
  @Get(':videoId/provenance')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getProvenance(
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
  ): Promise<{ data: IMediaProvenancePackage }> {
    const readScope = resolveTenantReadScope(user);
    const data = await this.videoProvenanceService.buildProvenance(
      videoId,
      {
        organizationId: readScope.organizationId,
        userId: user.userId ?? user.id,
      },
      readScope,
    );

    return { data };
  }

  @TenantReadPolicy('selected')
  @Get(':videoId/provenance/watermark-evaluation')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getWatermarkEvaluation(
    @CurrentUser() user: User,
    @Param('videoId') videoId: string,
  ): Promise<{ data: IMediaWatermarkAttributionEvaluation }> {
    const readScope = resolveTenantReadScope(user);
    const data =
      await this.videoProvenanceService.buildWatermarkAttributionEvaluation(
        videoId,
        {
          organizationId: readScope.organizationId,
          userId: user.userId ?? user.id,
        },
        readScope,
      );

    return { data };
  }
}
