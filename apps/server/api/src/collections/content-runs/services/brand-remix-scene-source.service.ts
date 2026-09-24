import { BrandRemixSourceResolverService } from '@api/collections/content-runs/services/brand-remix-source-resolver.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/index';
import type { BrandRemixRunConfig } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { readIngredientMediaUrl } from '@libs/media/media-url.util';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixSceneSourceService {
  constructor(private readonly source: BrandRemixSourceResolverService, private readonly prisma: PrismaService, private readonly mediaUrls: MediaUrlService, private readonly files: FilesClientService) {}
  async prepare(organizationId: string, brandId: string, config: BrandRemixRunConfig) {
    if (config.analysisSource) {
      await this.source.resolveSource(organizationId, brandId, config.sourceSnapshot.selector);
      const selected = await this.libraryAsset(organizationId, brandId, config.analysisSource.assetId);
      if (selected.assetUpdatedAt !== config.analysisSource.assetUpdatedAt) throw new ConflictException('The analysis video changed. Attach it again and request new analysis.');
      return selected;
    }
    const media = config.sourceSnapshot.media;
    if (media?.status !== 'saved' || media.category !== 'video') throw new ConflictException('Scene analysis requires a permitted saved video. Choose pattern-only remix for previews.');
    const resolved = await this.source.resolveSource(organizationId, brandId, config.sourceSnapshot.selector);
    const permission = resolved.sourceMedia;
    const owned = config.sourceSnapshot.selector.kind === 'owned_post' && permission?.existingAssetIds.includes(media.assetId);
    if (!owned && (permission?.importPolicy !== 'permitted' || !permission.importPermissionRef || (permission.importExpiresAt && (!Number.isFinite(Date.parse(permission.importExpiresAt)) || Date.parse(permission.importExpiresAt) <= Date.now())))) throw new ConflictException('Source analysis permission is unavailable or expired.');
    const asset = await this.prisma.ingredient.findFirst({ where: scopedWhere(organizationId, { brandId, id: media.assetId, category: 'VIDEO' }), include: { metadata: true } });
    if (!asset) throw new ConflictException('The saved source video is unavailable to this brand.');
    const url = readIngredientMediaUrl(asset) ?? (asset.s3Key ? this.mediaUrls.buildUrl(asset.s3Key) : undefined);
    if (!url) throw new ConflictException('The saved source video has no accessible media.');
    const probe = await this.files.probeMediaFromUrl(url, 'video');
    if (!probe.durationSeconds || probe.durationSeconds > 60 || !probe.sizeBytes || probe.sizeBytes > 104_857_600) throw new ConflictException('Source analysis requires a known duration up to 60 seconds and size up to 100 MiB.');
    return { sourceAssetId: asset.id, url, durationSeconds: probe.durationSeconds, sizeBytes: probe.sizeBytes };
  }
  async libraryAsset(organizationId: string, brandId: string, assetId: string) {
    const asset = await this.prisma.ingredient.findFirst({ where: scopedWhere(organizationId, { brandId, id: assetId, category: 'VIDEO', scope: 'USER', status: { in: ['UPLOADED', 'GENERATED', 'VALIDATED'] } }), include: { metadata: true } });
    if (!asset || asset.sourceActionId?.startsWith('remix-source:')) throw new ConflictException('Choose an available video from this brand Library.');
    const url = readIngredientMediaUrl(asset) ?? (asset.s3Key ? this.mediaUrls.buildUrl(asset.s3Key) : undefined);
    if (!url) throw new ConflictException('Library video has no accessible stored media.');
    const probe = await this.files.probeMediaFromUrl(url, 'video');
    if (!probe.durationSeconds || probe.durationSeconds > 60 || !probe.sizeBytes || probe.sizeBytes > 104_857_600) throw new ConflictException('Analysis video must be at most 60 seconds and 100 MiB with known duration and size.');
    return { sourceAssetId: asset.id, assetUpdatedAt: asset.updatedAt.toISOString(), url, durationSeconds: probe.durationSeconds, sizeBytes: probe.sizeBytes };
  }

}
