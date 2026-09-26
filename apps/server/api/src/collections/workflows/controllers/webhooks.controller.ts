/**
 * Webhooks Controller
 *
 * Public endpoint for triggering workflows via webhook.
 * No authentication guard - uses webhook secret validation.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { WorkflowWebhookService } from '@api/collections/workflows/services/workflow-webhook.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import {
  RateLimit,
  RateLimitPresets,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { WorkflowWebhookAuthType } from '@genfeedai/contracts';
import { Public } from '@libs/decorators/public.decorator';
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

const WORKFLOW_WEBHOOK_AUTH_TYPES = new Set<string>(
  Object.values(WorkflowWebhookAuthType),
);

function isWorkflowWebhookAuthType(
  value: unknown,
): value is WorkflowWebhookAuthType {
  return typeof value === 'string' && WORKFLOW_WEBHOOK_AUTH_TYPES.has(value);
}

@AutoSwagger()
@Public()
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly workflowWebhookService: WorkflowWebhookService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Trigger workflow via webhook
   *
   * Validates authentication based on workflow's webhook configuration:
   * - 'none': No authentication required
   * - 'secret': Requires X-Webhook-Secret header
   * - 'bearer': Requires Authorization: Bearer {token} header
   *
   * Every rejection on this route — an unknown webhook ID, an unrecognized
   * stored auth type, a missing/invalid secret, or a missing/invalid bearer
   * token — returns the identical generic 401 below. This route is
   * unauthenticated by design (`@Public()`), so a caller must not be able to
   * use the response to tell an unknown ID apart from a known one with the
   * wrong credential (see genfeedai/genfeed.ai#5248).
   */
  @Post(':webhookId')
  @RateLimit(RateLimitPresets.webhook)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async triggerWebhook(
    @Param('webhookId') webhookId: string,
    @Body() payload: WebhookPayload,
    @Headers('x-webhook-secret') secretHeader?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<{ data: { runId: string; status: string; message: string } }> {
    const workflow =
      await this.workflowWebhookService.findByWebhookId(webhookId);

    if (!workflow) {
      this.logger.warn(`Webhook trigger rejected: unknown id`, { webhookId });
      throw this.unauthorized();
    }

    const authType = this.resolveAuthType(workflow.webhookAuthType);
    if (!authType) {
      this.logger.warn(`Webhook trigger rejected: unrecognized auth type`, {
        authType: workflow.webhookAuthType,
        webhookId,
      });
      throw this.unauthorized();
    }

    if (authType === WorkflowWebhookAuthType.NONE) {
      // Explicit no-op: this workflow opted out of a credential check. The
      // webhook ID itself (128 bits of CSPRNG entropy) is the only secret.
    } else if (authType === WorkflowWebhookAuthType.SECRET) {
      if (
        !secretHeader ||
        !workflow.webhookSecret ||
        !this.validateSecret(secretHeader, workflow.webhookSecret)
      ) {
        this.logger.warn(`Webhook trigger rejected: invalid secret`, {
          webhookId,
        });
        throw this.unauthorized();
      }
    } else if (authType === WorkflowWebhookAuthType.BEARER) {
      const token = this.extractBearerToken(authHeader);
      if (
        !token ||
        !workflow.webhookSecret ||
        !this.validateSecret(token, workflow.webhookSecret)
      ) {
        this.logger.warn(`Webhook trigger rejected: invalid bearer token`, {
          webhookId,
        });
        throw this.unauthorized();
      }
    } else {
      // Unreachable given `resolveAuthType`'s exhaustive check above, but
      // fail closed rather than silently falling through if that ever
      // changes.
      throw this.unauthorized();
    }

    // Log the webhook trigger
    this.logger.log(`Webhook triggered: ${webhookId}`, {
      payloadKeys: Object.keys(payload),
      webhookId,
      workflowId: workflow.id.toString(),
    });

    try {
      // Trigger the workflow
      const result = await this.workflowWebhookService.triggerViaWebhook(
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
      // Never return `error.message` to the caller: this is an
      // unauthenticated public endpoint, and an internal error can carry
      // details (a Prisma error, a stack fragment) that shouldn't leave the
      // server. The full error is logged server-side instead.
      this.logger.error(`Webhook trigger failed: ${webhookId}`, error);

      throw new HttpException(
        { error: 'Failed to trigger workflow', status: 500 },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Resolve and validate the workflow's stored `webhookAuthType`.
   *
   * `webhookAuthType` is a plain string inside the workflow's JSON `config`
   * blob (not a Prisma enum column), so nothing at the database layer stops
   * a bad write from persisting an unrecognized value. A missing/empty value
   * defaults to `'secret'` (the historical default); anything else must be
   * one of `WorkflowWebhookAuthType`'s members or this returns `undefined`,
   * which the caller treats as a hard rejection rather than an open gate —
   * see genfeedai/genfeed.ai#5248.
   */
  private resolveAuthType(
    raw: string | null | undefined,
  ): WorkflowWebhookAuthType | undefined {
    if (raw === null || raw === undefined || raw === '') {
      return WorkflowWebhookAuthType.SECRET;
    }

    return isWorkflowWebhookAuthType(raw) ? raw : undefined;
  }

  /**
   * Strictly extract a bearer token: exactly one scheme and one token,
   * scheme compared case-insensitively (RFC 7235).
   *
   * TODO(#5206 / #5227): replace with the shared `parseAuthorizationHeader`
   * from `@libs/auth/authorization-header` once that PR merges — duplicated
   * here (rather than depending on unmerged work) so this fix doesn't block
   * on it. Keep the two in sync until then.
   */
  private extractBearerToken(
    authHeader: string | undefined,
  ): string | undefined {
    if (!authHeader) {
      return undefined;
    }

    const trimmed = authHeader.trim();
    if (!trimmed) {
      return undefined;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length !== 2) {
      return undefined;
    }

    const [scheme, token] = parts;
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
      return undefined;
    }

    return token;
  }

  /**
   * Validate webhook secret using a timing-safe comparison of fixed-length
   * SHA-256 digests. Hashing first (rather than comparing the raw buffers'
   * lengths before `timingSafeEqual`) means the comparison never depends on
   * the provided value's length, so a caller can't use response timing to
   * learn how long the real secret is.
   */
  private validateSecret(provided: string, expected: string): boolean {
    try {
      const providedDigest = createHash('sha256')
        .update(provided, 'utf8')
        .digest();
      const expectedDigest = createHash('sha256')
        .update(expected, 'utf8')
        .digest();

      return timingSafeEqual(providedDigest, expectedDigest);
    } catch {
      return false;
    }
  }

  private unauthorized(): HttpException {
    return new HttpException(
      { error: 'Unauthorized', status: 401 },
      HttpStatus.UNAUTHORIZED,
    );
  }
}
