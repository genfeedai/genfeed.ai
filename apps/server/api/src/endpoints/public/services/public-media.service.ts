import { VideoProvenanceService } from '@api/collections/videos/services/video-provenance.service';
import type {
  IMediaProvenanceManifest,
  IPublicMediaRouteReference,
} from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

const publicMediaPath = (assetId: string): string => `/public/media/${assetId}`;

@Injectable()
export class PublicMediaService {
  constructor(
    private readonly videoProvenanceService: VideoProvenanceService,
  ) {}

  async getRouteReference(
    assetId: string,
  ): Promise<IPublicMediaRouteReference> {
    const mediaPackage =
      await this.videoProvenanceService.buildPublicProvenance(assetId);
    const basePath = publicMediaPath(mediaPackage.assetId);

    const isVideo = mediaPackage.manifest.kind === 'video';

    return {
      assetId: mediaPackage.assetId,
      canonicalUrl: mediaPackage.manifest.canonicalUrl,
      kind: mediaPackage.manifest.kind,
      manifestFilename: mediaPackage.manifestFilename,
      manifestPath: `${basePath}/manifest.json`,
      mediaPath: isVideo
        ? `/public/videos/${mediaPackage.assetId}/video.mp4`
        : null,
      provenancePath: basePath,
      publicPagePath: isVideo ? `/public/videos/${mediaPackage.assetId}` : null,
      transcriptFilename: mediaPackage.transcriptSidecar.filename,
      transcriptPath: `${basePath}/transcript.vtt`,
    };
  }

  async getManifest(assetId: string): Promise<IMediaProvenanceManifest> {
    const mediaPackage =
      await this.videoProvenanceService.buildPublicProvenance(assetId);

    return mediaPackage.manifest;
  }

  async getTranscriptVtt(assetId: string): Promise<string> {
    const mediaPackage =
      await this.videoProvenanceService.buildPublicProvenance(assetId);

    return mediaPackage.transcriptSidecar.vtt;
  }
}
