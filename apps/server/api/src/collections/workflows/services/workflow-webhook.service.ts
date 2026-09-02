import { type WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { toPrismaJson } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { Injectable, Optional } from '@nestjs/common';

export type WorkflowWebhookAuthType = 'none' | 'secret' | 'bearer';

/**
 * Per-workflow inbound webhook subsystem: credential generation/rotation,
 * webhook-id lookup, and the public trigger path. Split out of
 * `WorkflowsService` (#754) — webhook crypto and trigger accounting are a
 * cohesive concern that does not belong in the core workflow service.
 */
@Injectable()
export class WorkflowWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly workflowsService: WorkflowsService,
    @Optional()
    private readonly workflowExecutorService?: WorkflowExecutorService,
  ) {}

  /**
   * Generate a webhook URL for a workflow
   */
  @HandleErrors('generate webhook', 'workflows')
  async generateWebhook(
    workflowId: string,
    organizationId: string,
    authType: WorkflowWebhookAuthType = 'secret',
  ): Promise<{
    webhookId: string;
    webhookUrl: string;
    webhookSecret: string | null;
    authType: WorkflowWebhookAuthType;
  }> {
    const webhookId = this.generateWebhookId();
    const webhookSecret =
      authType !== 'none' ? this.generateWebhookSecret() : null;
    const baseUrl = this.configService.apiUrl;

    await this.patchWorkflowConfig(workflowId, organizationId, {
      webhookAuthType: authType,
      webhookId,
      webhookSecret,
    });

    return {
      authType,
      webhookId,
      webhookSecret,
      webhookUrl: `${baseUrl}/v1/webhooks/${webhookId}`,
    };
  }

  /**
   * Regenerate webhook secret
   */
  @HandleErrors('regenerate webhook secret', 'workflows')
  async regenerateWebhookSecret(
    workflowId: string,
    organizationId: string,
  ): Promise<{ webhookSecret: string }> {
    const webhookSecret = this.generateWebhookSecret();

    await this.patchWorkflowConfig(workflowId, organizationId, {
      webhookSecret,
    });

    return { webhookSecret };
  }

  /**
   * Delete webhook configuration
   */
  @HandleErrors('delete webhook', 'workflows')
  async deleteWebhook(
    workflowId: string,
    organizationId: string,
  ): Promise<void> {
    await this.patchWorkflowConfig(workflowId, organizationId, {
      webhookAuthType: 'secret',
      webhookId: null,
      webhookLastTriggeredAt: null,
      webhookSecret: null,
      webhookTriggerCount: 0,
    });
  }

  /**
   * Find workflow by webhook ID (for public trigger endpoint).
   *
   * Filters on `config->>'webhookId'` in the database (backed by the partial
   * expression index `workflows_config_webhook_id_idx`) instead of loading
   * every workflow and scanning in JS.
   */
  @HandleErrors('find by webhook', 'workflows')
  async findByWebhookId(webhookId: string): Promise<WorkflowDocument | null> {
    const matches = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "workflows"
      WHERE "isDeleted" = false
        AND config->>'webhookId' = ${webhookId}
      LIMIT 1
    `;

    const match = matches[0];
    if (!match) {
      return null;
    }

    return this.workflowsService.findOne({
      id: match.id,
    });
  }

  /**
   * Trigger workflow via webhook
   */
  @HandleErrors('trigger via webhook', 'workflows')
  async triggerViaWebhook(
    webhookId: string,
    payload: Record<string, unknown>,
  ): Promise<{ runId: string; status: string }> {
    const workflow = await this.findByWebhookId(webhookId);

    if (!workflow) {
      throw new NotFoundException({
        message: 'Webhook not found or workflow deleted',
      });
    }

    // Systemic workflow templates legitimately have no scalar owner IDs.
    const userId = workflow.userId ?? undefined;
    const organizationId = workflow.organizationId ?? undefined;

    if (!userId || !organizationId) {
      throw new Error(
        'Systemic workflow templates cannot be executed directly. Clone the workflow first.',
      );
    }

    const currentWebhookTriggerCount =
      typeof workflow.webhookTriggerCount === 'number'
        ? workflow.webhookTriggerCount
        : 0;
    await this.patchWorkflowConfig(String(workflow.id), organizationId, {
      webhookLastTriggeredAt: new Date().toISOString(),
      webhookTriggerCount: currentWebhookTriggerCount + 1,
    });

    if (!this.workflowExecutorService) {
      throw new Error(
        'Workflow executor service is not available - cannot trigger workflow',
      );
    }

    const result = await this.workflowExecutorService.executeManualWorkflow(
      String(workflow.id),
      userId,
      organizationId,
      payload,
      {
        triggerSource: 'webhook',
        webhookId,
      },
      WorkflowExecutionTrigger.API,
    );

    return {
      runId: result.executionId,
      status: result.status,
    };
  }

  /**
   * Generate a unique webhook ID
   */
  private generateWebhookId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `wh_${timestamp}_${random}`;
  }

  private getWorkflowConfigRecord(config: unknown): Record<string, unknown> {
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      return { ...(config as Record<string, unknown>) };
    }

    return {};
  }

  private async patchWorkflowConfig(
    workflowId: string,
    organizationId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const workflow = await this.prisma.workflow.findFirst({
      select: { config: true, id: true, organizationId: true },
      where: scopedWhere(organizationId, { id: workflowId }),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    const nextConfig = {
      ...this.getWorkflowConfigRecord(workflow.config),
      ...updates,
    };

    await this.prisma.workflow.update({
      data: {
        config: toPrismaJson(nextConfig),
      },
      where: scopedWhere(workflow.organizationId, { id: workflow.id }),
    });
  }

  /**
   * Generate a secure webhook secret
   */
  private generateWebhookSecret(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = 'whsec_';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }
}
