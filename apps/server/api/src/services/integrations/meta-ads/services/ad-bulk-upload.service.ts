import { randomUUID } from 'node:crypto';
import type { CreativeSource } from '@api/collections/ad-bulk-upload-jobs/schemas/ad-bulk-upload-job.schema';
import { AdBulkUploadWorkflowService } from '@api/collections/workflows/services/ad-bulk-upload-workflow.service';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface CreateBulkUploadInput {
  organizationId: string;
  brandId?: string;
  credentialId: string;
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
  userId?: string;
}

@Injectable()
export class AdBulkUploadService {
  constructor(private readonly workflow: AdBulkUploadWorkflowService) {}

  async createBulkUpload(
    input: CreateBulkUploadInput,
  ): Promise<{ jobId: string; workflowJobId: string }> {
    this.validateInput(input);
    const totalPermutations =
      (input.images.length + input.videos.length) *
      input.headlines.length *
      input.bodyCopies.length;

    if (totalPermutations === 0) {
      throw new BadRequestException(
        'No permutations to generate. Provide at least one media item, one headline, and one body copy.',
      );
    }

    const jobId = randomUUID();
    return this.workflow.queue(
      {
        adAccountId: input.adAccountId,
        adSetId: input.adSetId,
        bodyCopies: input.bodyCopies,
        brandId: input.brandId || undefined,
        callToAction: input.callToAction,
        campaignId: input.campaignId,
        creativeSource: input.creativeSource,
        credentialId: input.credentialId,
        headlines: input.headlines,
        images: input.images,
        jobId,
        linkUrl: input.linkUrl,
        organizationId: input.organizationId,
        videos: input.videos,
      },
      input.userId,
    );
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
    if (input.creativeSource !== 'manual-upload') {
      throw new BadRequestException(
        `Creative source ${input.creativeSource} requires an explicit asset-resolution workflow`,
      );
    }
  }
}
