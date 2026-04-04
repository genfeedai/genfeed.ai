/**
 * Webhooks Controller
 *
 * Public endpoint for triggering workflows via webhook.
 * No authentication guard - uses webhook secret validation.
 */

import { timingSafeEqual } from 'node:crypto';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

interface WebhookPayload {
  [key: string]: unknown;
}

@AutoSwagger()
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Trigger workflow via webhook
   *
   * Validates authentication based on workflow's webhook configuration:
   * - 'none': No authentication required
   * - 'secret': Requires X-Webhook-Secret header
   * - 'bearer': Requires Authorization: Bearer {token} header
   */
  @Post(':webhookId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async triggerWebhook(
    @Param('webhookId') webhookId: string,
    @Body() payload: WebhookPayload,
    @Headers('x-webhook-secret') secretHeader?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<{ data: { runId: string; status: string; message: string } }> {
    // Find workflow by webhook ID
    const workflow = await this.workflowsService.findByWebhookId(webhookId);

    if (!workflow) {
      throw new HttpException(
        { error: 'Webhook not found', status: 404 },
        HttpStatus.NOT_FOUND,
      );
    }

    // Validate authentication based on workflow's webhook auth type
    const authType = workflow.webhookAuthType || 'secret';

    if (authType === 'secret') {
      if (!secretHeader) {
        throw new HttpException(
          { error: 'Missing X-Webhook-Secret header', status: 401 },
          HttpStatus.UNAUTHORIZED,
        );
      }

      if (
        !workflow.webhookSecret ||
        !this.validateSecret(secretHeader, workflow.webhookSecret)
      ) {
        throw new HttpException(
          { error: 'Invalid webhook secret', status: 401 },
          HttpStatus.UNAUTHORIZED,
        );
      }
    } else if (authType === 'bearer') {
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new HttpException(
          { error: 'Missing or invalid Authorization header', status: 401 },
          HttpStatus.UNAUTHORIZED,
        );
      }

      const token = authHeader.substring(7);
      if (
        !workflow.webhookSecret ||
        !this.validateSecret(token, workflow.webhookSecret)
      ) {
        throw new HttpException(
          { error: 'Invalid bearer token', status: 401 },
          HttpStatus.UNAUTHORIZED,
        );
      }
    }
    // authType === 'none': no validation required

    // Log the webhook trigger
    this.logger.log(`Webhook triggered: ${webhookId}`, {
      payloadKeys: Object.keys(payload),
      webhookId,
      workflowId: workflow._id.toString(),
    });

    try {
      // Trigger the workflow
      const result = await this.workflowsService.triggerViaWebhook(
        webhookId,
        payload,
      );

      return {
        data: {
          message: 'Workflow execution queued',
          runId: result.runId,
          status: result.status,
        },
      };
    } catch (error: unknown) {
      const message = (error as Error)?.message ?? 'Failed to trigger workflow';
      this.logger.error(`Webhook trigger failed: ${webhookId}`, error);

      throw new HttpException(
        { error: message, status: 500 },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Validate webhook secret using timing-safe comparison
   */
  private validateSecret(provided: string, expected: string): boolean {
    try {
      const providedBuffer = Buffer.from(provided, 'utf8');
      const expectedBuffer = Buffer.from(expected, 'utf8');

      if (providedBuffer.length !== expectedBuffer.length) {
        return false;
      }

      return timingSafeEqual(providedBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }
}
