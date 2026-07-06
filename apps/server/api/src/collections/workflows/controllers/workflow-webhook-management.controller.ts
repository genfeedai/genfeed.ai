import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PatchWorkflowWebhookDto } from '@api/collections/workflows/dto/webhook.dto';
import { WorkflowWebhookService } from '@api/collections/workflows/services/workflow-webhook.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { ConfigService } from '@api/config/config.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

type WebhookAuthType = 'none' | 'secret' | 'bearer';

/**
 * Per-workflow webhook configuration (generate / rotate secret / delete /
 * inspect). The inbound trigger traffic itself is handled by
 * `WebhooksController`. Split out of the former monolithic `WorkflowsController`.
 */
@AutoSwagger()
@Controller('workflows')
export class WorkflowWebhookManagementController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowWebhookService: WorkflowWebhookService,
    private readonly configService: ConfigService,
    readonly _loggerService: LoggerService,
  ) {}

  private normalizeWebhookAuthType(value: unknown): WebhookAuthType {
    return value === 'none' || value === 'bearer' || value === 'secret'
      ? value
      : 'secret';
  }

  @Post(':workflowId/webhook')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async generateWebhook(
    @Param('workflowId') workflowId: string,
    @Body() body: { authType?: 'none' | 'secret' | 'bearer' },
    @CurrentUser() user: User,
  ): Promise<{
    data: {
      webhookId: string;
      webhookUrl: string;
      webhookSecret: string | null;
      authType: 'none' | 'secret' | 'bearer';
    };
  }> {
    const publicMetadata = getPublicMetadata(user);
    await this.workflowsService.findMutableOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    const result = await this.workflowWebhookService.generateWebhook(
      workflowId,
      body.authType || 'secret',
    );

    return { data: result };
  }

  /**
   * Update the webhook config. `rotateSecret: true` regenerates the secret in
   * place. Collapsed from the former
   * `POST /workflows/:id/webhook/regenerate-secret` RPC route (#1354); the
   * 'webhook not configured' guard is preserved.
   */
  @Patch(':workflowId/webhook')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async patchWebhook(
    @Param('workflowId') workflowId: string,
    @Body() body: PatchWorkflowWebhookDto,
    @CurrentUser() user: User,
  ): Promise<{ data: { webhookSecret: string } }> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findMutableOwnedOrThrow(
      workflowId,
      {
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      },
    );

    if (!body.rotateSecret) {
      throw new HttpException(
        'No supported webhook update was requested',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!workflow.webhookId) {
      throw new HttpException(
        'Webhook not configured for this workflow',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result =
      await this.workflowWebhookService.regenerateWebhookSecret(workflowId);
    return { data: result };
  }

  @Delete(':workflowId/webhook')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async deleteWebhook(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<{ data: { message: string } }> {
    const publicMetadata = getPublicMetadata(user);
    await this.workflowsService.findMutableOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    await this.workflowWebhookService.deleteWebhook(workflowId);
    return { data: { message: 'Webhook deleted' } };
  }

  @Get(':workflowId/webhook')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getWebhookInfo(
    @Param('workflowId') workflowId: string,
    @CurrentUser() user: User,
  ): Promise<{
    data: {
      webhookId: string | null;
      webhookUrl: string | null;
      authType: 'none' | 'secret' | 'bearer';
      triggerCount: number;
      lastTriggeredAt: Date | null;
    };
  }> {
    const publicMetadata = getPublicMetadata(user);
    const workflow = await this.workflowsService.findOwnedOrThrow(workflowId, {
      organization: publicMetadata.organization,
      user: publicMetadata.user,
    });

    const baseUrl = this.configService.apiUrl;

    return {
      data: {
        authType: this.normalizeWebhookAuthType(workflow.webhookAuthType),
        lastTriggeredAt: workflow.webhookLastTriggeredAt || null,
        triggerCount: workflow.webhookTriggerCount || 0,
        webhookId: workflow.webhookId || null,
        webhookUrl: workflow.webhookId
          ? `${baseUrl}/v1/webhooks/${workflow.webhookId}`
          : null,
      },
    };
  }
}
