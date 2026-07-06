import { type WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { LegacyWorkflowStepRunner } from '@api/collections/workflows/services/legacy-workflow-step-runner.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
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
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly workflowsService: WorkflowsService,
    @Optional()
    private readonly legacyWorkflowStepRunner?: LegacyWorkflowStepRunner,
    @Optional()
    private readonly workflowExecutorService?: WorkflowExecutorService,
  ) {}

  /**
   * Generate a webhook URL for a workflow
   */
  @HandleErrors('generate webhook', 'workflows')
  async generateWebhook(
    workflowId: string,
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

    await this.patchWorkflowConfig(workflowId, {
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
  ): Promise<{ webhookSecret: string }> {
    const webhookSecret = this.generateWebhookSecret();

    await this.patchWorkflowConfig(workflowId, { webhookSecret });

    return { webhookSecret };
  }

  /**
   * Delete webhook configuration
   */
  @HandleErrors('delete webhook', 'workflows')
  async deleteWebhook(workflowId: string): Promise<void> {
    await this.patchWorkflowConfig(workflowId, {
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
      _id: match.id,
      isDeleted: false,
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

    // Update webhook stats
    const currentWebhookTriggerCount =
      typeof workflow.webhookTriggerCount === 'number'
        ? workflow.webhookTriggerCount
        : 0;
    await this.patchWorkflowConfig(String(workflow.id), {
      webhookLastTriggeredAt: new Date().toISOString(),
      webhookTriggerCount: currentWebhookTriggerCount + 1,
    });

    if (!workflow.user || !workflow.organization) {
      throw new Error(
        'Systemic workflow templates cannot be executed directly. Clone the workflow first.',
      );
    }

    if (!this.shouldUseNodeExecutor(workflow)) {
      if (!this.legacyWorkflowStepRunner) {
        throw new Error(
          'Legacy workflow step runner is not available - cannot trigger step workflow',
        );
      }

      await this.legacyWorkflowStepRunner.executeWorkflow(String(workflow.id));
      return {
        runId: String(workflow.id),
        status: 'started',
      };
    }

    if (!this.workflowExecutorService) {
      throw new Error(
        'Workflow executor service is not available - cannot trigger workflow',
      );
    }

    const result = await this.workflowExecutorService.executeManualWorkflow(
      String(workflow.id),
      workflow.user.toString(),
      workflow.organization.toString(),
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

  private shouldUseNodeExecutor(
    workflow: Pick<WorkflowDocument, 'nodes'> | null | undefined,
  ): boolean {
    return Array.isArray(workflow?.nodes) && workflow.nodes.length > 0;
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
    updates: Record<string, unknown>,
  ): Promise<void> {
    const workflow = await this.prisma.workflow.findFirst({
      select: { config: true, id: true },
      where: { id: workflowId, isDeleted: false },
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
        config: nextConfig as never,
      },
      where: { id: workflow.id },
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
