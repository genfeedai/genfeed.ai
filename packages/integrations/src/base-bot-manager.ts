import {
  REDACTED_VALUE,
  redactSensitiveValue,
} from '@genfeedai/helpers/security/redact-sensitive-value.helper';
import { type IntegrationEvent, REDIS_EVENTS } from './constants';
import type { BotManager, OrgIntegration } from './types';

const TELEGRAM_BOT_TOKEN_PATTERN = /\d{6,}:[A-Za-z0-9_-]{20,}\b/g;

export interface BotManagerLogger {
  debug(message: string, context?: unknown): void;
  error(message: string, trace?: unknown, context?: unknown): void;
  log(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
}

/**
 * Abstract base class for platform bot managers
 */
export abstract class BaseBotManager<TBotInstance = unknown>
  implements BotManager
{
  protected readonly bots = new Map<string, TBotInstance>();

  protected constructor(protected readonly logger: BotManagerLogger) {}

  abstract initialize(): Promise<void>;
  abstract shutdown(): Promise<void>;
  abstract createBotInstance(
    integration: OrgIntegration,
  ): Promise<TBotInstance>;
  abstract destroyBotInstance(botInstance: TBotInstance): Promise<void>;

  async addIntegration(integration: OrgIntegration): Promise<void> {
    try {
      this.logger.log(
        `Adding integration ${integration.id} for org ${integration.orgId}`,
      );

      if (this.bots.has(integration.id)) {
        this.logger.warn(
          `Integration ${integration.id} already exists, updating instead`,
        );
        await this.updateIntegration(integration);
        return;
      }

      const botInstance = await this.createBotInstance(integration);
      this.bots.set(integration.id, botInstance);

      this.logger.log(`Successfully added integration ${integration.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to add integration ${integration.id}:`,
        this.sanitizeErrorForLog(error),
      );
      throw error;
    }
  }

  async updateIntegration(integration: OrgIntegration): Promise<void> {
    try {
      this.logger.log(
        `Updating integration ${integration.id} for org ${integration.orgId}`,
      );

      // Remove existing bot
      await this.removeIntegration(integration.id);

      // Add updated bot
      await this.addIntegration(integration);

      this.logger.log(`Successfully updated integration ${integration.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to update integration ${integration.id}:`,
        this.sanitizeErrorForLog(error),
      );
      throw error;
    }
  }

  async removeIntegration(integrationId: string): Promise<void> {
    try {
      this.logger.log(`Removing integration ${integrationId}`);

      const botInstance = this.bots.get(integrationId);
      if (botInstance) {
        await this.destroyBotInstance(botInstance);
        this.bots.delete(integrationId);
        this.logger.log(`Successfully removed integration ${integrationId}`);
      } else {
        this.logger.warn(`Integration ${integrationId} not found`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to remove integration ${integrationId}:`,
        this.sanitizeErrorForLog(error),
      );
      throw error;
    }
  }

  getActiveCount(): number {
    return this.bots.size;
  }

  async handleRedisEvent(event: string, data: IntegrationEvent): Promise<void> {
    try {
      this.logger.debug(`Handling Redis event: ${event}`, data);

      switch (event) {
        case REDIS_EVENTS.INTEGRATION_CREATED:
          // Fetch integration details from API and add
          await this.fetchAndAddIntegration(data.integrationId);
          break;

        case REDIS_EVENTS.INTEGRATION_UPDATED:
          // Fetch updated integration details and update
          await this.fetchAndUpdateIntegration(data.integrationId);
          break;

        case REDIS_EVENTS.INTEGRATION_DELETED:
          // Remove the integration
          await this.removeIntegration(data.integrationId);
          break;

        default:
          this.logger.warn(`Unknown Redis event: ${event}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle Redis event ${event}:`,
        this.sanitizeErrorForLog(error),
      );
    }
  }

  /**
   * Reduce errors to useful diagnostics before they cross the logging boundary.
   * Request clients attach credentials to config, headers, and response bodies;
   * those objects must never be handed to a logger, even one with redaction.
   */
  protected sanitizeErrorForLog(error: unknown): Record<string, unknown> {
    let safeError: Record<string, unknown>;

    if (error instanceof Error) {
      const requestError = error as Error & {
        code?: unknown;
        response?: { status?: unknown; statusText?: unknown };
      };
      safeError = {
        code: requestError.code,
        message: error.message,
        status: requestError.response?.status,
        statusText: requestError.response?.statusText,
      };
    } else if (typeof error === 'object' && error !== null) {
      const errorRecord = error as Record<string, unknown>;
      safeError = {
        code: errorRecord.code,
        message: errorRecord.message,
        name: errorRecord.name,
      };
    } else {
      safeError = { raw: String(error) };
    }

    const redactedError = redactSensitiveValue(safeError) as Record<
      string,
      unknown
    >;

    return Object.fromEntries(
      Object.entries(redactedError).map(([key, value]) => [
        key,
        typeof value === 'string'
          ? value.replace(TELEGRAM_BOT_TOKEN_PATTERN, REDACTED_VALUE)
          : value,
      ]),
    );
  }

  protected abstract fetchAndAddIntegration(
    integrationId: string,
  ): Promise<void>;
  protected abstract fetchAndUpdateIntegration(
    integrationId: string,
  ): Promise<void>;
}
