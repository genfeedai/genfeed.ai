import { createHash } from 'node:crypto';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { assertSafeWebhookEndpoint } from '@api/services/webhook-client/webhook-endpoint.validator';
import {
  createSampleGenerationWebhookPayload,
  GENERATION_WEBHOOK_EVENT_TYPES,
  type GenerationWebhookEventType,
} from '@api-types/contracts/generation-webhook-events.contract';
import { createSamplePublishWebhookPayload } from '@api-types/contracts/publish-webhook-events.contract';
import {
  isOrganizationWebhookEventEnabled,
  isOrganizationWebhookEventType,
  type OrganizationWebhookEventType,
} from '@api-types/contracts/webhook-events.contract';
import { redactWebhookText } from '@api-types/contracts/webhook-events.shared';
import {
  createSampleWorkflowWebhookPayload,
  WORKFLOW_WEBHOOK_EVENT_TYPES,
  type WorkflowWebhookEventType,
} from '@api-types/contracts/workflow-webhook-events.contract';
import type { IWebhookDeliveryStatus } from '@genfeedai/interfaces';
import {
  WEBHOOK_CLIENT_QUEUE,
  type WebhookJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

export const WEBHOOK_DEDUPE_RETENTION_SECONDS = 24 * 60 * 60;
export const WEBHOOK_FAILED_RETENTION_SECONDS = 7 * 24 * 60 * 60;

export const PUBLISH_WEBHOOK_JOB_ID_PREFIX = 'publish-webhook-';
export const GENERATION_WEBHOOK_JOB_ID_PREFIX = 'generation-webhook-';
export const WORKFLOW_WEBHOOK_JOB_ID_PREFIX = 'workflow-webhook-';

export interface WebhookDispatchPayload {
  event: OrganizationWebhookEventType;
  eventId: string;
  timestamp: string;
}

export interface WebhookDispatchOptions {
  deliveryId?: string;
  ignoreEventFilter?: boolean;
  isTest?: boolean;
  jobIdPrefix?: string;
  logLabel?: string;
}

/**
 * Single dispatch core for every outbound webhook family. Owns the pieces that
 * must not diverge between publish, generation, and workflow emitters: the
 * endpoint/secret guard, the organization event filter, the SSRF check, the
 * deterministic dedupe job id, and the recorded delivery status.
 */
@Injectable()
export class WebhookDispatchService {
  private readonly constructorName = 'WebhookDispatchService';

  constructor(
    @InjectQueue(WEBHOOK_CLIENT_QUEUE)
    private readonly webhookQueue: Queue<WebhookJobData>,
    private readonly logger: LoggerService,
    private readonly organizationSettingsService: OrganizationSettingsService,
  ) {}

  async dispatch(
    organizationId: string,
    payload: WebhookDispatchPayload,
    options: WebhookDispatchOptions = {},
  ): Promise<IWebhookDeliveryStatus | null> {
    const label = options.logLabel ?? this.constructorName;
    const settings = await this.organizationSettingsService.findOne({
      organizationId: organizationId,
    });

    if (
      !settings?.isWebhookEnabled ||
      !settings.webhookEndpoint ||
      !settings.webhookSecret
    ) {
      return null;
    }

    if (
      !options.ignoreEventFilter &&
      !isOrganizationWebhookEventEnabled(
        readWebhookEventTypes(settings.webhookEventTypes),
        payload.event,
      )
    ) {
      this.logger.log(`${label} webhook filtered`, {
        event: payload.event,
        eventId: payload.eventId,
        organizationId,
      });
      return null;
    }

    await assertSafeWebhookEndpoint(settings.webhookEndpoint);

    const deliveryId = options.deliveryId ?? payload.eventId;
    const jobIdPrefix = options.jobIdPrefix ?? 'webhook-';
    const jobData: WebhookJobData = {
      deliveryId,
      endpoint: settings.webhookEndpoint,
      isTest: options.isTest,
      organizationId,
      payload: { ...payload },
      secret: settings.webhookSecret,
    };

    await this.webhookQueue.add(
      'send-webhook',
      jobData,
      options.isTest
        ? { jobId: createWebhookJobId(jobIdPrefix, deliveryId) }
        : {
            // Retried emitters must resolve to the same BullMQ jobId long
            // enough to suppress duplicate terminal events.
            jobId: createWebhookJobId(jobIdPrefix, payload.eventId),
            removeOnComplete: {
              age: WEBHOOK_DEDUPE_RETENTION_SECONDS,
              count: 10_000,
            },
            removeOnFail: {
              age: WEBHOOK_FAILED_RETENTION_SECONDS,
              count: 10_000,
            },
          },
    );

    const status: IWebhookDeliveryStatus = {
      attempt: 0,
      deliveryId,
      event: payload.event,
      isTest: Boolean(options.isTest),
      queuedAt: new Date().toISOString(),
      status: 'queued',
    };
    await this.organizationSettingsService.recordWebhookDeliveryStatus(
      organizationId,
      status,
    );

    this.logger.log(`${label} webhook queued`, {
      event: payload.event,
      deliveryId,
      eventId: payload.eventId,
      organizationId,
    });

    return status;
  }

  /**
   * Queue a sample payload for any event in the catalog. Test deliveries bypass
   * the organization event filter so an operator can probe a single event
   * without widening the filter first.
   */
  async sendTestDelivery(input: {
    event?: OrganizationWebhookEventType;
    organizationId: string;
  }): Promise<IWebhookDeliveryStatus> {
    const settings = await this.organizationSettingsService.findOne({
      organizationId: input.organizationId,
    });

    if (
      !settings?.isWebhookEnabled ||
      !settings.webhookEndpoint ||
      !settings.webhookSecret
    ) {
      throw new BadRequestException('Webhook endpoint is not configured');
    }

    const event =
      input.event ??
      readWebhookEventTypes(settings.webhookEventTypes)[0] ??
      'target.published';
    const payload = createSampleWebhookPayload(event, new Date());

    try {
      const status = await this.dispatch(input.organizationId, payload, {
        deliveryId: [
          'webhook-test',
          input.organizationId,
          payload.event,
          Date.now().toString(36),
        ].join(':'),
        ignoreEventFilter: true,
        isTest: true,
        jobIdPrefix: resolveTestJobIdPrefix(event),
        logLabel: `${this.constructorName} test`,
      });

      if (!status) {
        throw new BadRequestException('Webhook endpoint is not configured');
      }

      return status;
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        redactWebhookText(
          (error as Error)?.message || 'Webhook test delivery failed',
        ),
      );
    }
  }
}

function createSampleWebhookPayload(
  event: OrganizationWebhookEventType,
  occurredAt: Date,
): WebhookDispatchPayload {
  if (isGenerationWebhookEventType(event)) {
    return createSampleGenerationWebhookPayload({
      event,
      generationId: 'generation_test',
      occurredAt,
    });
  }

  if (isWorkflowWebhookEventType(event)) {
    return createSampleWorkflowWebhookPayload({
      event,
      executionId: 'execution_test',
      occurredAt,
      workflowId: 'workflow_test',
    });
  }

  return createSamplePublishWebhookPayload({
    event,
    occurredAt,
    releaseId: 'release_test',
    targetId: 'target_test',
  });
}

function resolveTestJobIdPrefix(event: OrganizationWebhookEventType): string {
  if (isGenerationWebhookEventType(event)) {
    return GENERATION_WEBHOOK_JOB_ID_PREFIX;
  }

  if (isWorkflowWebhookEventType(event)) {
    return WORKFLOW_WEBHOOK_JOB_ID_PREFIX;
  }

  return PUBLISH_WEBHOOK_JOB_ID_PREFIX;
}

function isGenerationWebhookEventType(
  event: OrganizationWebhookEventType,
): event is GenerationWebhookEventType {
  return GENERATION_WEBHOOK_EVENT_TYPES.includes(
    event as GenerationWebhookEventType,
  );
}

function isWorkflowWebhookEventType(
  event: OrganizationWebhookEventType,
): event is WorkflowWebhookEventType {
  return WORKFLOW_WEBHOOK_EVENT_TYPES.includes(
    event as WorkflowWebhookEventType,
  );
}

function createWebhookJobId(prefix: string, eventId: string): string {
  return `${prefix}${createHash('sha256').update(eventId).digest('hex')}`;
}

function readWebhookEventTypes(value: unknown): OrganizationWebhookEventType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isOrganizationWebhookEventType);
}
