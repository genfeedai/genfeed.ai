import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import type { McpRole } from '@mcp/services/auth.service';
import type { Server } from '@modelcontextprotocol/sdk/server';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { instrument, PostHog } from '@posthog/mcp';

interface AnalyticsIdentity {
  organizationId?: string;
  role?: McpRole;
  userId?: string;
}

const REDACTED_MCP_PROPERTIES = [
  '$mcp_error_message',
  '$mcp_intent',
  '$mcp_intent_source',
  '$mcp_parameters',
  '$mcp_response',
] as const;

/**
 * Privacy boundary for hosted MCP analytics.
 *
 * The PostHog MCP SDK records protocol lifecycle and tool names/durations, but
 * this wrapper removes every free-form payload before it can leave the service.
 * API keys are never passed to this service.
 */
@Injectable()
export class PostHogAnalyticsService implements OnModuleDestroy {
  private readonly client: PostHog | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const projectToken = this.configService.get('POSTHOG_PROJECT_API_KEY') as
      | string
      | undefined;

    this.client = projectToken
      ? new PostHog(projectToken, {
          host:
            (this.configService.get('POSTHOG_HOST') as string | undefined) ||
            'https://eu.i.posthog.com',
        })
      : null;
  }

  instrumentServer(server: Server, identity?: AnalyticsIdentity): void {
    if (!this.client) {
      return;
    }

    instrument(server, this.client, {
      beforeSend: (event) => {
        for (const property of REDACTED_MCP_PROPERTIES) {
          delete event.properties[property];
        }
        return event;
      },
      context: false,
      enableConversationId: false,
      enableExceptionAutocapture: false,
      eventProperties: () => ({
        app_surface: 'mcp.genfeed.ai',
        service: 'mcp',
        ...(identity?.role ? { mcp_role: identity.role } : {}),
      }),
      identify: identity?.userId
        ? {
            distinctId: identity.userId,
            ...(identity.organizationId
              ? { groups: { organization: identity.organizationId } }
              : {}),
          }
        : null,
      logger: (message) =>
        this.logger.debug(message, { service: 'PostHogMcpAnalytics' }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client._shutdown(5_000);
  }
}
