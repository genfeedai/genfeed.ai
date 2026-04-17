import { CreativeSource } from '@api/collections/ad-bulk-upload-jobs/schemas/ad-bulk-upload-job.schema';
import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import { AdBulkUploadJobData } from '@api/queues/ad-bulk-upload/ad-bulk-upload.processor';
import { QueueService } from '@api/queues/core/queue.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface CreateBulkUploadInput {
  organizationId: string;
  brandId?: string;
  credentialId: string;
  accessToken: string;
  adAccountId: string;
  campaignId: string;
  adSetId: string;
  creativeSource: CreativeSource;
  images: string[];
  videos: string[];
  headlines: string[];
  bodyCopies: string[];
  callToAction?: string;
  linkUrl: string;
}

@Injectable()
export class AdBulkUploadService {
  private readonly constructorName = this.constructor.name;
  private readonly QUEUE_NAME = 'ad-bulk-upload';

  constructor(
    private readonly logger: LoggerService,
    private readonly bulkUploadJobsService: AdBulkUploadJobsService,
    private readonly queueService: QueueService,
  ) {}

  async createBulkUpload(
    input: CreateBulkUploadInput,
  ): Promise<{ jobId: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.validateInput(input);

    const resolvedMedia = this.resolveCreativeSources(input);

    const totalPermutations =
      (resolvedMedia.images.length + resolvedMedia.videos.length) *
      input.headlines.length *
      input.bodyCopies.length;

    if (totalPermutations === 0) {
      throw new BadRequestException(
        'No permutations to generate. Provide at least one media item, one headline, and one body copy.',
      );
    }

    const jobDoc = await this.bulkUploadJobsService.create({
      adAccountId: input.adAccountId,
      adSetId: input.adSetId,
      bodyCopies: input.bodyCopies,
      brand: input.brandId ? input.brandId : undefined,
      callToAction: input.callToAction,
      campaignId: input.campaignId,
      creativeSource: input.creativeSource,
      credential: input.credentialId,
      headlines: input.headlines,
      images: resolvedMedia.images,
      linkUrl: input.linkUrl,
      organization: input.organizationId,
      status: 'pending',
      totalPermutations,
      videos: resolvedMedia.videos,
    });

    const jobId = String(jobDoc._id);

    const queueData: AdBulkUploadJobData = {
      accessToken: input.accessToken,
      adAccountId: input.adAccountId,
      adSetId: input.adSetId,
      bodyCopies: input.bodyCopies,
      brandId: input.brandId,
      callToAction: input.callToAction,
      campaignId: input.campaignId,
      credentialId: input.credentialId,
      headlines: input.headlines,
      images: resolvedMedia.images,
      jobId,
      linkUrl: input.linkUrl,
      organizationId: input.organizationId,
      videos: resolvedMedia.videos,
    };

    await this.queueService.add(this.QUEUE_NAME, queueData, {
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      jobId,
    });

    this.logger.log(
      `${caller} created bulk upload job ${jobId} with ${totalPermutations} permutations`,
    );

    return { jobId };
  }

  private validateInput(input: CreateBulkUploadInput): void {
    if (!input.credentialId) {
      throw new BadRequestException('credentialId is required');
    }
    if (!input.adAccountId) {
      throw new BadRequestException('adAccountId is required');
    }
    if (!input.campaignId) {
      throw new BadRequestException('campaignId is required');
    }
    if (!input.adSetId) {
      throw new BadRequestException('adSetId is required');
    }
    if (!input.linkUrl) {
      throw new BadRequestException('linkUrl is required');
    }
    if (input.headlines.length === 0) {
      throw new BadRequestException('At least one headline is required');
    }
    if (input.bodyCopies.length === 0) {
      throw new BadRequestException('At least one body copy is required');
    }
    if (input.images.length === 0 && input.videos.length === 0) {
      throw new BadRequestException('At least one image or video is required');
    }
  }

  private resolveCreativeSources(input: CreateBulkUploadInput): {
    images: string[];
    videos: string[];
  } {
    switch (input.creativeSource) {
      case 'content-library':
        this.logger.warn(
          `${this.constructorName}: Content library integration is pending. Using provided URLs directly.`,
        );
        return { images: input.images, videos: input.videos };

      case 'ai-generated':
        this.logger.warn(
          `${this.constructorName}: AI pipeline integration is pending. Using provided URLs directly.`,
        );
        return { images: input.images, videos: input.videos };

      case 'manual-upload':
      default:
        return { images: input.images, videos: input.videos };
    }
  }
}
