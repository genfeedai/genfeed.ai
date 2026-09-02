import { AdBulkUploadJobsService } from '@api/collections/ad-bulk-upload-jobs/services/ad-bulk-upload-jobs.service';
import {
  AdCreativeMappingsService,
  type CreateAdCreativeMappingInput,
} from '@api/collections/ad-creative-mappings/services/ad-creative-mappings.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { MetaAdsService } from '@api/services/integrations/meta-ads/services/meta-ads.service';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { CredentialPlatform } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';

export const AD_BULK_UPLOAD_ACTION_IDS = {
  BUILD_MEDIA_ITEMS: 'ads.bulk-upload.build-media-items',
  BUILD_PERMUTATIONS: 'ads.bulk-upload.build-permutations',
  CLAIM: 'ads.bulk-upload.claim',
  CREATE_AD: 'ads.bulk-upload.create-ad',
  FAIL: 'ads.bulk-upload.fail',
  FINALIZE: 'ads.bulk-upload.finalize',
  UPLOAD_MEDIA: 'ads.bulk-upload.upload-media',
} as const;

export const AD_BULK_UPLOAD_WORKFLOW_ID = 'ads.bulk-upload';
export const AD_BULK_UPLOAD_MEDIA_CHILD_WORKFLOW_ID =
  'ads.bulk-upload.upload-media-item';
export const AD_BULK_UPLOAD_AD_CHILD_WORKFLOW_ID =
  'ads.bulk-upload.create-ad-item';

export type AdBulkUploadWorkflowRequest = {
  adAccountId: string;
  adSetId: string;
  bodyCopies: string[];
  brandId?: string;
  callToAction?: string;
  campaignId: string;
  credentialId: string;
  creativeSource: 'ai-generated' | 'content-library' | 'manual-upload';
  headlines: string[];
  images: string[];
  jobId: string;
  linkUrl: string;
  organizationId: string;
  videos: string[];
};

type MediaItem = {
  jobId: string;
  mediaType: 'image' | 'video';
  organizationId: string;
  request: AdBulkUploadWorkflowRequest;
  sourceUrl: string;
};

type UploadedMedia = MediaItem & { mediaRef: string };

type AdPermutation = {
  body: string;
  headline: string;
  index: number;
  mediaRef: string;
  mediaType: 'image' | 'video';
  request: AdBulkUploadWorkflowRequest;
};

function actionNode(
  actionId: string,
  id: string,
  y: number,
  inputVariableKeys: string[] = [],
  parameters: Record<string, unknown> = {},
) {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys,
    parameters,
    position: { x: 0, y },
  });
}

export function buildAdBulkUploadWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: AD_BULK_UPLOAD_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'claim-to-media-items',
          source: 'claim-job',
          target: 'build-media-items',
          targetHandle: 'request',
        },
        {
          id: 'media-items-to-upload',
          source: 'build-media-items',
          sourceHandle: 'items',
          target: 'upload-each-media',
          targetHandle: 'items',
        },
        {
          id: 'claim-to-permutations',
          source: 'claim-job',
          target: 'build-permutations',
          targetHandle: 'request',
        },
        {
          id: 'uploads-to-permutations',
          source: 'upload-each-media',
          target: 'build-permutations',
          targetHandle: 'uploads',
        },
        {
          id: 'permutations-to-create',
          source: 'build-permutations',
          sourceHandle: 'items',
          target: 'create-each-ad',
          targetHandle: 'items',
        },
        {
          id: 'claim-to-finalize',
          source: 'claim-job',
          target: 'finalize-job',
          targetHandle: 'request',
        },
        {
          id: 'creation-to-finalize',
          source: 'create-each-ad',
          target: 'finalize-job',
          targetHandle: 'outcomes',
        },
        ...[
          'claim-job',
          'build-media-items',
          'upload-each-media',
          'build-permutations',
          'create-each-ad',
          'finalize-job',
        ].map((source) => ({
          id: `${source}-to-failure`,
          source,
          sourceHandle: 'failure',
          target: `${source}-failure`,
          targetHandle: 'failure',
        })),
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Bulk upload request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        actionNode(AD_BULK_UPLOAD_ACTION_IDS.CLAIM, 'claim-job', 0, [
          'request',
        ]),
        actionNode(
          AD_BULK_UPLOAD_ACTION_IDS.BUILD_MEDIA_ITEMS,
          'build-media-items',
          180,
        ),
        actionNode('workflow.for-each', 'upload-each-media', 360, [], {
          childWorkflowId: AD_BULK_UPLOAD_MEDIA_CHILD_WORKFLOW_ID,
          itemInputKey: 'item',
          maxConcurrency: 2,
          mode: 'await',
        }),
        actionNode(
          AD_BULK_UPLOAD_ACTION_IDS.BUILD_PERMUTATIONS,
          'build-permutations',
          540,
        ),
        actionNode('workflow.for-each', 'create-each-ad', 720, [], {
          childWorkflowId: AD_BULK_UPLOAD_AD_CHILD_WORKFLOW_ID,
          itemInputKey: 'item',
          maxConcurrency: 2,
          mode: 'await',
        }),
        actionNode(AD_BULK_UPLOAD_ACTION_IDS.FINALIZE, 'finalize-job', 900),
        ...[
          'claim-job',
          'build-media-items',
          'upload-each-media',
          'build-permutations',
          'create-each-ad',
          'finalize-job',
        ].map((source, index) =>
          actionNode(
            AD_BULK_UPLOAD_ACTION_IDS.FAIL,
            `${source}-failure`,
            1080 + index * 120,
            ['request'],
          ),
        ),
      ],
    },
    description:
      'Uploads creative media, creates every ad permutation, and finalizes the durable bulk job through action-backed child workflows.',
    label: 'Meta Ads Bulk Upload',
    resultNodeId: 'finalize-job',
    version: 1,
  };
}

function childWorkflow(
  canonicalId: string,
  actionId: string,
  label: string,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId,
    definition: {
      edges: [],
      inputVariables: [
        { key: 'item', label: 'Work item', required: true, type: 'json' },
      ],
      nodes: [actionNode(actionId, 'execute-item', 0, ['item'])],
    },
    description: `${label} for one bounded bulk-upload item.`,
    label,
    resultNodeId: 'execute-item',
    version: 1,
  };
}

export const AD_BULK_UPLOAD_CHILD_WORKFLOWS = [
  childWorkflow(
    AD_BULK_UPLOAD_MEDIA_CHILD_WORKFLOW_ID,
    AD_BULK_UPLOAD_ACTION_IDS.UPLOAD_MEDIA,
    'Upload bulk-ad media item',
  ),
  childWorkflow(
    AD_BULK_UPLOAD_AD_CHILD_WORKFLOW_ID,
    AD_BULK_UPLOAD_ACTION_IDS.CREATE_AD,
    'Create bulk-ad permutation',
  ),
] satisfies SystemWorkflowGraphDefinition[];

@Injectable()
export class AdBulkUploadWorkflowService {
  constructor(
    private readonly jobs: AdBulkUploadJobsService,
    private readonly mappings: AdCreativeMappingsService,
    private readonly credentials: CredentialsService,
    private readonly metaAds: MetaAdsService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly logger: LoggerService,
  ) {}

  async queue(
    request: AdBulkUploadWorkflowRequest,
    userId?: string,
  ): Promise<{ jobId: string; workflowJobId: string }> {
    const definition = buildAdBulkUploadWorkflowDefinition();
    const workflowJobId = await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'meta-ads-bulk-api',
        userId,
      },
      `ad-bulk-upload-${request.jobId}`,
      { attempts: 1 },
    );
    return { jobId: request.jobId, workflowJobId };
  }

  async claim(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<AdBulkUploadWorkflowRequest> {
    const request = this.readRequest(input.request);
    this.assertScope(request, organizationId);
    await this.jobs.create({
      ...request,
      completedPermutations: 0,
      failedPermutations: 0,
      id: request.jobId,
      status: 'processing',
      totalPermutations:
        (request.images.length + request.videos.length) *
        request.headlines.length *
        request.bodyCopies.length,
    });
    return request;
  }

  buildMediaItems(input: Record<string, unknown>): { items: MediaItem[] } {
    const request = this.readRequest(input.request);
    return {
      items: [
        ...request.images.map((sourceUrl) => ({
          jobId: request.jobId,
          mediaType: 'image' as const,
          organizationId: request.organizationId,
          request,
          sourceUrl,
        })),
        ...request.videos.map((sourceUrl) => ({
          jobId: request.jobId,
          mediaType: 'video' as const,
          organizationId: request.organizationId,
          request,
          sourceUrl,
        })),
      ],
    };
  }

  async uploadMedia(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<UploadedMedia> {
    const item = this.readMediaItem(input.item);
    const request = item.request;
    this.assertScope(request, organizationId);
    const token = await this.resolveToken(request, organizationId);
    if (item.mediaType === 'image') {
      const result = await this.metaAds.uploadAdImage(
        token,
        request.adAccountId,
        item.sourceUrl,
      );
      return { ...item, mediaRef: result.hash };
    }
    const result = await this.metaAds.uploadAdVideo(
      token,
      request.adAccountId,
      item.sourceUrl,
    );
    return { ...item, mediaRef: result.videoId };
  }

  buildPermutations(input: Record<string, unknown>): {
    items: AdPermutation[];
  } {
    const request = this.readRequest(input.request);
    const uploads = this.readForEachResults(input.uploads).map((result) =>
      this.readUploadedMedia(result),
    );
    const items: AdPermutation[] = [];
    let index = 0;
    for (const headline of request.headlines) {
      for (const body of request.bodyCopies) {
        for (const upload of uploads) {
          items.push({
            body,
            headline,
            index: index++,
            mediaRef: upload.mediaRef,
            mediaType: upload.mediaType,
            request,
          });
        }
      }
    }
    return { items };
  }

  async createAd(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ index: number; status: 'completed' | 'failed' }> {
    const permutation = this.readPermutation(input.item);
    this.assertScope(permutation.request, organizationId);
    try {
      const token = await this.resolveToken(
        permutation.request,
        organizationId,
      );
      const adId = await this.metaAds.createAd(
        token,
        permutation.request.adAccountId,
        {
          adSetId: permutation.request.adSetId,
          creative: {
            body: permutation.body,
            callToAction: permutation.request.callToAction,
            imageHash:
              permutation.mediaType === 'image'
                ? permutation.mediaRef
                : undefined,
            linkUrl: permutation.request.linkUrl,
            title: permutation.headline,
            videoId:
              permutation.mediaType === 'video'
                ? permutation.mediaRef
                : undefined,
          },
          name: `${permutation.headline.slice(0, 30)}_${permutation.mediaType}_${permutation.index}`,
        },
      );
      const mapping: CreateAdCreativeMappingInput = {
        adAccountId: permutation.request.adAccountId,
        externalAdId: adId,
        genfeedContentId: `bulk-${permutation.request.jobId}-${permutation.index}`,
        metadata: {
          body: permutation.body,
          bulkJobId: permutation.request.jobId,
          headline: permutation.headline,
          mediaRef: permutation.mediaRef,
          mediaType: permutation.mediaType,
          permutationIndex: permutation.index,
        },
        organizationId,
        platform: 'meta',
        status: 'draft',
        ...(permutation.request.brandId
          ? { brandId: permutation.request.brandId }
          : {}),
      };
      await this.mappings.create(mapping);
      await this.jobs.incrementProgress(
        permutation.request.jobId,
        'completedPermutations',
      );
      return { index: permutation.index, status: 'completed' };
    } catch (error: unknown) {
      await this.jobs.incrementProgress(
        permutation.request.jobId,
        'failedPermutations',
      );
      await this.jobs.addError(permutation.request.jobId, {
        message: error instanceof Error ? error.message : String(error),
        permutationIndex: permutation.index,
        timestamp: new Date(),
      });
      this.logger.error(
        `Ad bulk upload permutation ${permutation.index} failed`,
        error,
      );
      return { index: permutation.index, status: 'failed' };
    }
  }

  async finalize(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{
    completed: number;
    failed: number;
    jobId: string;
    status: 'completed' | 'failed' | 'partial';
  }> {
    const request = this.readRequest(input.request);
    this.assertScope(request, organizationId);
    const outcomes = this.readForEachResults(input.outcomes).map((result) =>
      this.readRecord(result),
    );
    const completed = outcomes.filter(
      (outcome) => outcome.status === 'completed',
    ).length;
    const failed = outcomes.length - completed;
    const status =
      failed === 0 ? 'completed' : completed === 0 ? 'failed' : 'partial';
    await this.jobs.updateStatus(request.jobId, status);
    return { completed, failed, jobId: request.jobId, status };
  }

  async fail(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ jobId: string; status: 'failed' }> {
    const jobId = this.readRequest(input.request).jobId;
    await this.requireJob(jobId, organizationId);
    await this.jobs.updateStatus(jobId, 'failed');
    return { jobId, status: 'failed' };
  }

  private async resolveToken(
    request: AdBulkUploadWorkflowRequest,
    organizationId: string,
  ): Promise<string> {
    const credential = await this.credentials.findOne({
      id: request.credentialId,
      isConnected: true,
      isDeleted: false,
      organizationId,
      platform: CredentialPlatform.FACEBOOK,
    });
    if (!credential?.accessToken) {
      throw new Error(
        `Facebook credential ${request.credentialId} is unavailable`,
      );
    }
    return EncryptionUtil.decrypt(credential.accessToken);
  }

  private async requireJob(jobId: string, organizationId: string) {
    const job = await this.jobs.findById(jobId, organizationId);
    if (!job) {
      throw new Error(`Ad bulk upload job ${jobId} was not found`);
    }
    return job;
  }

  private readForEachResults(value: unknown): unknown[] {
    const record = this.readRecord(value);
    if (!Array.isArray(record.results)) {
      throw new Error('Ad bulk upload fan-out completed without results');
    }
    return record.results.map((entry) => this.readRecord(entry).result);
  }

  private readRequest(value: unknown): AdBulkUploadWorkflowRequest {
    const record = this.readRecord(value);
    return {
      adAccountId: this.requiredString(record.adAccountId, 'adAccountId'),
      adSetId: this.requiredString(record.adSetId, 'adSetId'),
      bodyCopies: this.readStrings(record.bodyCopies, 'bodyCopies'),
      ...(this.optionalString(record.brandId)
        ? { brandId: this.optionalString(record.brandId) }
        : {}),
      ...(this.optionalString(record.callToAction)
        ? { callToAction: this.optionalString(record.callToAction) }
        : {}),
      campaignId: this.requiredString(record.campaignId, 'campaignId'),
      credentialId: this.requiredString(record.credentialId, 'credentialId'),
      creativeSource: this.readCreativeSource(record.creativeSource),
      headlines: this.readStrings(record.headlines, 'headlines'),
      images: this.readOptionalStrings(record.images),
      jobId: this.requiredString(record.jobId, 'jobId'),
      linkUrl: this.requiredString(record.linkUrl, 'linkUrl'),
      organizationId: this.requiredString(
        record.organizationId,
        'organizationId',
      ),
      videos: this.readOptionalStrings(record.videos),
    };
  }

  private readMediaItem(value: unknown): MediaItem {
    const item = this.readRecord(value);
    const mediaType = item.mediaType;
    if (mediaType !== 'image' && mediaType !== 'video') {
      throw new Error('Ad bulk upload media item has an invalid type');
    }
    return {
      jobId: this.requiredString(item.jobId, 'jobId'),
      mediaType,
      organizationId: this.requiredString(
        item.organizationId,
        'organizationId',
      ),
      request: this.readRequest(item.request),
      sourceUrl: this.requiredString(item.sourceUrl, 'sourceUrl'),
    };
  }

  private readUploadedMedia(value: unknown): UploadedMedia {
    return {
      ...this.readMediaItem(value),
      mediaRef: this.requiredString(
        this.readRecord(value).mediaRef,
        'mediaRef',
      ),
    };
  }

  private readPermutation(value: unknown): AdPermutation {
    const item = this.readRecord(value);
    const mediaType = item.mediaType;
    if (mediaType !== 'image' && mediaType !== 'video') {
      throw new Error('Ad permutation has an invalid media type');
    }
    return {
      body: this.requiredString(item.body, 'body'),
      headline: this.requiredString(item.headline, 'headline'),
      index: this.readIndex(item.index),
      mediaRef: this.requiredString(item.mediaRef, 'mediaRef'),
      mediaType,
      request: this.readRequest(item.request),
    };
  }

  private assertScope(
    request: AdBulkUploadWorkflowRequest,
    organizationId: string,
  ): void {
    if (request.organizationId !== organizationId) {
      throw new Error('Ad bulk upload organization scope mismatch');
    }
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readStrings(value: unknown, field: string): string[] {
    const values = this.readOptionalStrings(value);
    if (values.length === 0) {
      throw new Error(`Ad bulk upload requires ${field}`);
    }
    return values;
  }

  private readOptionalStrings(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
      : [];
  }

  private readCreativeSource(
    value: unknown,
  ): AdBulkUploadWorkflowRequest['creativeSource'] {
    if (
      value === 'ai-generated' ||
      value === 'content-library' ||
      value === 'manual-upload'
    ) {
      return value;
    }
    throw new Error('Ad bulk upload requires a supported creative source');
  }

  private readIndex(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error('Ad bulk upload requires a permutation index');
    }
    return value;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private requiredString(value: unknown, field: string): string {
    const resolved = this.optionalString(value);
    if (!resolved) {
      throw new Error(`Ad bulk upload requires ${field}`);
    }
    return resolved;
  }
}
