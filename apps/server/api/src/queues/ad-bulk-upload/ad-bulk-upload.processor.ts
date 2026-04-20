import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import {
  AdCreativeMappingsService,
  type CreateAdCreativeMappingInput,
} from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';

import type { AdBulkUploadJobData } from './ad-bulk-upload-job.interface';

interface BulkPermutation {
  mediaType: 'image' | 'video';
  mediaRef: string;
  headline: string;
  body: string;
}

@Injectable()
@Processor('ad-bulk-upload')
export class AdBulkUploadProcessor extends WorkerHost {
  private readonly DELAY_MS = 2000;

  constructor(
    private readonly logger: LoggerService,
    private readonly metaAdsService: MetaAdsService,
    private readonly bulkUploadJobsService: AdBulkUploadJobsService,
    private readonly creativeMappingsService: AdCreativeMappingsService,
  ) {
    super();
  }

  async process(job: Job<AdBulkUploadJobData>): Promise<void> {
    const { jobId, organizationId, adAccountId } = job.data;

    this.logger.log(
      `Processing bulk upload job ${jobId} for org ${organizationId}`,
    );

    try {
      await this.bulkUploadJobsService.updateStatus(jobId, 'processing');

      const uploadedMedia = await this.uploadMedia(job.data);
      const permutations = this.generatePermutations(job.data, uploadedMedia);

      let completedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < permutations.length; i++) {
        const currentJob = await this.bulkUploadJobsService.findById(
          jobId,
          organizationId,
        );
        if (currentJob?.status === 'cancelled') {
          this.logger.log(
            `Bulk upload job ${jobId} was cancelled at permutation ${i}`,
          );
          return;
        }

        try {
          await this.processPermutation(job.data, permutations[i], i);
          completedCount++;
          await this.bulkUploadJobsService.incrementProgress(
            jobId,
            'completedPermutations',
          );
        } catch (error: unknown) {
          failedCount++;
          await this.bulkUploadJobsService.incrementProgress(
            jobId,
            'failedPermutations',
          );
          await this.bulkUploadJobsService.addError(jobId, {
            message: (error as Error).message,
            permutationIndex: i,
            timestamp: new Date(),
          });
          this.logger.error(
            `Permutation ${i} failed for job ${jobId}`,
            (error as Error).message,
          );
        }

        if (i < permutations.length - 1) {
          await this.delay(this.DELAY_MS);
        }

        const progress = Math.round(((i + 1) / permutations.length) * 100);
        await job.updateProgress(progress);
      }

      const finalStatus =
        failedCount === 0
          ? 'completed'
          : completedCount === 0
            ? 'failed'
            : 'partial';

      await this.bulkUploadJobsService.updateStatus(jobId, finalStatus);

      this.logger.log(
        `Bulk upload job ${jobId} finished: ${completedCount} completed, ${failedCount} failed`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Bulk upload job ${jobId} failed`,
        (error as Error).message,
      );
      await this.bulkUploadJobsService.updateStatus(jobId, 'failed');
      throw error;
    }
  }

  private async uploadMedia(data: AdBulkUploadJobData): Promise<{
    imageHashes: Map<string, string>;
    videoIds: Map<string, string>;
  }> {
    const imageHashes = new Map<string, string>();
    const videoIds = new Map<string, string>();

    for (const imageUrl of data.images) {
      try {
        const result = await this.metaAdsService.uploadAdImage(
          data.accessToken,
          data.adAccountId,
          imageUrl,
        );
        imageHashes.set(imageUrl, result.hash);
        await this.delay(this.DELAY_MS);
      } catch (error: unknown) {
        this.logger.error(
          `Failed to upload image ${imageUrl}`,
          (error as Error).message,
        );
        throw error;
      }
    }

    for (const videoUrl of data.videos) {
      try {
        const result = await this.metaAdsService.uploadAdVideo(
          data.accessToken,
          data.adAccountId,
          videoUrl,
        );
        videoIds.set(videoUrl, result.videoId);
        await this.delay(this.DELAY_MS);
      } catch (error: unknown) {
        this.logger.error(
          `Failed to upload video ${videoUrl}`,
          (error as Error).message,
        );
        throw error;
      }
    }

    return { imageHashes, videoIds };
  }

  private generatePermutations(
    data: AdBulkUploadJobData,
    uploadedMedia: {
      imageHashes: Map<string, string>;
      videoIds: Map<string, string>;
    },
  ): BulkPermutation[] {
    const permutations: BulkPermutation[] = [];

    for (const headline of data.headlines) {
      for (const body of data.bodyCopies) {
        for (const [, hash] of uploadedMedia.imageHashes) {
          permutations.push({
            body,
            headline,
            mediaRef: hash,
            mediaType: 'image',
          });
        }

        for (const [, videoId] of uploadedMedia.videoIds) {
          permutations.push({
            body,
            headline,
            mediaRef: videoId,
            mediaType: 'video',
          });
        }
      }
    }

    return permutations;
  }

  private async processPermutation(
    data: AdBulkUploadJobData,
    permutation: BulkPermutation,
    index: number,
  ): Promise<void> {
    const adName = `${permutation.headline.slice(0, 30)}_${permutation.mediaType}_${index}`;

    const adId = await this.metaAdsService.createAd(
      data.accessToken,
      data.adAccountId,
      {
        adSetId: data.adSetId,
        creative: {
          body: permutation.body,
          callToAction: data.callToAction,
          imageHash:
            permutation.mediaType === 'image'
              ? permutation.mediaRef
              : undefined,
          linkUrl: data.linkUrl,
          title: permutation.headline,
          videoId:
            permutation.mediaType === 'video'
              ? permutation.mediaRef
              : undefined,
        },
        name: adName,
      },
    );

    const mappingInput: CreateAdCreativeMappingInput = {
      adAccountId: data.adAccountId,
      externalAdId: adId,
      genfeedContentId: `bulk-${data.jobId}-${index}`,
      metadata: {
        body: permutation.body,
        bulkJobId: data.jobId,
        headline: permutation.headline,
        mediaRef: permutation.mediaRef,
        mediaType: permutation.mediaType,
        permutationIndex: index,
      },
      organization: data.organizationId,
      platform: 'meta',
      status: 'draft',
      ...(data.brandId && { brand: data.brandId }),
    };

    await this.creativeMappingsService.create(mappingInput);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
