import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type {
  AgentToolResult,
  AgentUiAction,
} from '@genfeedai/contracts/interfaces';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Connection status and OAuth connect card tools.
 * Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentConnectionToolHandler {
  constructor(
    @Optional()
    private readonly credentialsService?: CredentialsService,
  ) {}

  async getConnectionStatus(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.credentialsService) {
      return {
        creditsUsed: 0,
        error: 'Credentials service not available',
        success: false,
      };
    }

    const platform = String(params.platform || '')
      .trim()
      .toLowerCase();
    const credential = platform
      ? await this.credentialsService.findOne({
          isConnected: true,
          organizationId: ctx.organizationId,
          platform,
        })
      : null;

    return {
      creditsUsed: 0,
      data: {
        connected: !!credential,
        credentialId: credential ? String(credential.id) : null,
        platform: platform || null,
      },
      nextActions: credential
        ? []
        : [this.buildOAuthConnectCard(platform, '/agent', 'status')],
      success: true,
    };
  }

  async initiateOAuthConnect(
    params: Record<string, unknown>,
    _ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const platform = String(params.platform || '')
      .trim()
      .toLowerCase();
    const isOnboarding = Boolean(params.isOnboarding);
    const returnTo = isOnboarding ? '/agent/onboarding' : '/agent';

    return {
      creditsUsed: 0,
      data: {
        platform: platform || null,
        returnTo,
      },
      nextActions: [this.buildOAuthConnectCard(platform, returnTo, 'init')],
      success: true,
    };
  }

  async resolveHandle(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.credentialsService) {
      return {
        creditsUsed: 0,
        error: 'Credentials service not available',
        success: false,
      };
    }

    const handle = params.handle as string;

    if (!handle) {
      return {
        creditsUsed: 0,
        error: 'handle parameter is required',
        success: false,
      };
    }

    const credential = await this.credentialsService.findByHandle(
      handle,
      ctx.organizationId,
    );

    if (!credential) {
      return {
        creditsUsed: 0,
        error: `No connected credential found for handle "${handle}"`,
        success: false,
      };
    }

    return {
      creditsUsed: 0,
      data: {
        brandId: String(credential.brandId ?? ''),
        credentialId: String(credential.id),
        externalHandle: credential.externalHandle,
        externalName: credential.externalName,
        platform: credential.platform,
      },
      success: true,
    };
  }

  buildOAuthConnectCard(
    platform: string,
    returnTo: string,
    mode: 'init' | 'status',
  ): AgentUiAction {
    const normalizedPlatform = platform.trim().toLowerCase();
    const isGenericPicker = !normalizedPlatform;

    if (isGenericPicker) {
      return {
        ctas: [
          {
            href: `/settings/api-keys?returnTo=${encodeURIComponent(returnTo)}`,
            label: 'Open integrations',
          },
        ],
        data: { isGenericIntegrationPicker: true, returnTo },
        id: `oauth-connect-integrations-${Date.now()}`,
        title: 'Choose an integration',
        type: 'oauth_connect_card',
      };
    }

    const connectHref = `/settings/api-keys?connect=${normalizedPlatform}&returnTo=${encodeURIComponent(returnTo)}`;
    const label = normalizedPlatform;

    return {
      ctas: [{ href: connectHref, label: `Connect ${label}` }],
      data: { platform: normalizedPlatform, returnTo },
      id: `${mode === 'init' ? 'oauth-init' : 'oauth-connect'}-${normalizedPlatform}-${Date.now()}`,
      platform: normalizedPlatform,
      title:
        mode === 'status'
          ? `${label} not connected`
          : `Connect ${label} account`,
      type: 'oauth_connect_card',
    };
  }
}
