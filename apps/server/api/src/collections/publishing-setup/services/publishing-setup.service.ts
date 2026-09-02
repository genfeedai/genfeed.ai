import { PUBLISHING_PROVIDER_ENV_DESCRIPTORS } from '@api/collections/publishing-setup/publishing-setup.constants';
import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { getDeployment } from '@genfeedai/config';
import type {
  IPublishingSetupCheck,
  IPublishingSetupChecklist,
  IPublishingSetupDiagnosticsExport,
  PublishingDiagnosticSeverity,
} from '@genfeedai/contracts/interfaces';
import {
  classifyPublishingSetupChecklistState,
  sanitizePublishingDiagnostics,
} from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const SEVERITY_ORDER: Record<PublishingDiagnosticSeverity, number> = {
  error: 0,
  info: 2,
  warning: 1,
};

/**
 * Deployment-level publishing setup checklist.
 *
 * Answers "can this installation publish at all?" — the question that sits
 * upstream of per-credential readiness. Everything here is derived from
 * configuration *presence* plus bounded liveness probes; no provider network
 * calls are made and no configured value is ever echoed back.
 */
@Injectable()
export class PublishingSetupService {
  private static readonly PROBE_TIMEOUT_MS = 2_000;
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly microservicesService: MicroservicesService,
    private readonly prismaService: PrismaService,
    private readonly publishingProviderSetupService: PublishingProviderSetupService,
  ) {}

  async buildChecklist(): Promise<IPublishingSetupChecklist> {
    const checkedAt = new Date().toISOString();
    const drafts: IPublishingSetupCheck[] = [
      await this.checkDatabase(checkedAt),
      await this.checkQueueBackend(checkedAt),
      this.checkAuthSecret(checkedAt),
      this.publishingProviderSetupService.buildPublicCallbackCheck(checkedAt),
      ...PUBLISHING_PROVIDER_ENV_DESCRIPTORS.map((descriptor) =>
        this.publishingProviderSetupService.buildProviderCheck(
          descriptor,
          checkedAt,
        ),
      ),
    ];

    const checks: IPublishingSetupCheck[] = drafts.map((draft) => ({
      diagnostics: sanitizePublishingDiagnostics(draft.diagnostics),
      key: draft.key,
      label: draft.label,
      scope: draft.scope,
      status: draft.status,
    }));

    return {
      checks,
      generatedAt: checkedAt,
      state: classifyPublishingSetupChecklistState(checks),
    };
  }

  async exportDiagnostics(): Promise<IPublishingSetupDiagnosticsExport> {
    const checklist = await this.buildChecklist();

    return {
      checklist,
      deployment: getDeployment(),
      diagnostics: checklist.checks
        .flatMap((check) => check.diagnostics)
        .sort(
          (left, right) =>
            SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
        ),
      generatedAt: checklist.generatedAt,
    };
  }

  private async checkDatabase(
    checkedAt: string,
  ): Promise<IPublishingSetupCheck> {
    const draft: IPublishingSetupCheck = {
      diagnostics: [],
      key: 'core_runtime.database',
      label: 'Database connectivity',
      scope: 'core_runtime',
      status: 'pass',
    };

    try {
      await this.withTimeout(
        this.prismaService.$queryRaw`SELECT 1`,
        'Database connectivity probe timed out',
      );
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} checkDatabase: probe failed`,
        error,
      );
      draft.status = 'fail';
      draft.diagnostics.push({
        checkedAt,
        classification: 'provider_outage',
        code: 'database_unreachable',
        correctiveAction:
          'Verify DATABASE_URL and that the Postgres instance accepts connections from this host.',
        isRetryable: true,
        message: 'The scheduler database did not answer a liveness probe.',
        scope: 'core_runtime',
        severity: 'error',
      });
    }

    return draft;
  }

  private async checkQueueBackend(
    checkedAt: string,
  ): Promise<IPublishingSetupCheck> {
    const draft: IPublishingSetupCheck = {
      diagnostics: [],
      key: 'core_runtime.queue',
      label: 'Queue backend (Redis)',
      scope: 'core_runtime',
      status: 'pass',
    };

    if (!this.readConfig('REDIS_URL')) {
      draft.status = 'fail';
      draft.diagnostics.push({
        checkedAt,
        classification: 'misconfiguration',
        code: 'queue_backend_not_configured',
        correctiveAction:
          'Set REDIS_URL — scheduled publishing runs on BullMQ and cannot dispatch without it.',
        isRetryable: false,
        message: 'No queue backend is configured for scheduled publishing.',
        scope: 'core_runtime',
        severity: 'error',
      });

      return draft;
    }

    if (!(await this.microservicesService.checkRedisHealth())) {
      draft.status = 'fail';
      draft.diagnostics.push({
        checkedAt,
        classification: 'provider_outage',
        code: 'queue_backend_unreachable',
        correctiveAction:
          'Confirm the Redis instance referenced by REDIS_URL is reachable and accepting commands.',
        isRetryable: true,
        message: 'The configured queue backend did not answer a PING.',
        scope: 'core_runtime',
        severity: 'error',
      });
    }

    return draft;
  }

  private checkAuthSecret(checkedAt: string): IPublishingSetupCheck {
    const draft: IPublishingSetupCheck = {
      diagnostics: [],
      key: 'auth.session_secret',
      label: 'Authentication secret',
      scope: 'auth',
      status: 'pass',
    };

    if (!this.readConfig('BETTER_AUTH_SECRET')) {
      draft.status = 'fail';
      draft.diagnostics.push({
        checkedAt,
        classification: 'misconfiguration',
        code: 'auth_secret_missing',
        correctiveAction:
          'Set BETTER_AUTH_SECRET — OAuth connect callbacks cannot complete without a stable session secret.',
        isRetryable: false,
        message: 'The authentication session secret is not configured.',
        scope: 'auth',
        severity: 'error',
      });
    }

    return draft;
  }

  /** Reads presence only — the value never leaves this method. */
  private readConfig(key: string): string | null {
    const value = this.configService.get(key);
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMessage: string,
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(timeoutMessage)),
            PublishingSetupService.PROBE_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
