import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiresCloudAuth } from '@api/helpers/decorators/requires-cloud-auth.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DesktopSyncService } from './desktop-sync.service';
import { DesktopBrandManifestQueryDto } from './dto/desktop-brand-manifest-query.dto';
import { PushDesktopAssetsDto } from './dto/push-desktop-assets.dto';
import { PushDesktopSyncOpsDto } from './dto/push-desktop-sync-ops.dto';
import { PushDesktopThreadsDto } from './dto/push-desktop-threads.dto';
import { RequestDesktopAssetUploadDto } from './dto/request-desktop-asset-upload.dto';
import { UploadDesktopAssetDto } from './dto/upload-desktop-asset.dto';

@Controller('sync/desktop')
export class DesktopSyncController {
  constructor(private readonly desktopSyncService: DesktopSyncService) {}

  @Get('threads')
  @RequiresCloudAuth()
  @LogMethod()
  async pullThreads(
    @CurrentUser() user: User,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('messageLimit') messageLimit?: string,
  ) {
    return this.desktopSyncService.pullThreads(user, cursor, {
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      messageLimit: messageLimit
        ? Number.parseInt(messageLimit, 10)
        : undefined,
    });
  }

  @Post('threads')
  @RequiresCloudAuth()
  @LogMethod()
  async pushThreads(
    @CurrentUser() user: User,
    @Body() body: PushDesktopThreadsDto,
  ) {
    return this.desktopSyncService.pushThreads(user, body);
  }

  @Get('brand-manifest')
  @RequiresCloudAuth()
  @LogMethod()
  async getBrandManifest(
    @CurrentUser() user: User,
    @Query() query: DesktopBrandManifestQueryDto,
  ) {
    return this.desktopSyncService.getBrandManifest(user, query);
  }

  @Post('assets/metadata')
  @RequiresCloudAuth()
  @LogMethod()
  async pushAssets(
    @CurrentUser() user: User,
    @Body() body: PushDesktopAssetsDto,
  ) {
    return this.desktopSyncService.pushAssets(user, body);
  }

  @Post('assets/upload-url')
  @RequiresCloudAuth()
  @LogMethod()
  async requestAssetUpload(
    @CurrentUser() user: User,
    @Body() body: RequestDesktopAssetUploadDto,
  ) {
    return this.desktopSyncService.requestAssetUpload(user, body);
  }

  @Post('assets/:id/uploaded')
  @RequiresCloudAuth()
  @LogMethod()
  async confirmAssetUpload(@CurrentUser() user: User, @Param('id') id: string) {
    return this.desktopSyncService.confirmAssetUpload(user, id);
  }

  @Post('assets/:id/upload')
  @RequiresCloudAuth()
  @LogMethod()
  async uploadAsset(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: UploadDesktopAssetDto,
  ) {
    return this.desktopSyncService.uploadAsset(user, id, body);
  }

  @Post('ops')
  @RequiresCloudAuth()
  @LogMethod()
  async pushOps(
    @CurrentUser() user: User,
    @Body() body: PushDesktopSyncOpsDto,
  ) {
    return this.desktopSyncService.pushOps(user, body);
  }
}
