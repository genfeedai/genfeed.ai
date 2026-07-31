import {
  PUBLISHING_PROVIDER_ENV_DESCRIPTORS,
  type PublishingProviderEnvDescriptor,
} from '@api/collections/publishing-setup/publishing-setup.constants';
import {
  resolveOAuthAppUrl,
  resolveOAuthIssuerUrl,
} from '@api/oauth/oauth-metadata.util';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { getDeployment, isCloudDeployment } from '@genfeedai/config';
import {
  classifyPublishingSetupChecklistState,
  sanitizePublishingDiagnostics,
} from '@genfeedai/helpers';
import type {
  IPublishingDiagnostic,
  IPublishingSetupCheck,
  IPublishingSetupChecklist,
  IPublishingSetupDiagnosticsExport,
  PublishingDiagnosticSeverity,
  PublishingSetupCheckScope,
  PublishingSetupCheckStatus,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const SEVERITY_ORDER: Record<PublishingDiagnosticSeverity, number> = {
  error: 0,
  info: 2,
  warning: 1,
};

interface CheckDraft {
  diagnostics: IPublishingDiagnostic[];
  key: string;
  label: string;
  scope: PublishingSetupCheckScope;
  status: PublishingSetupCheckStatus;
}

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
  ) {}

  async buildChecklist(): Promise<IPublishingSetupChecklist> {
    const checkedAt = new Date().toISOString();
    const drafts: CheckDraft[] = [
      await this.checkDatabase(checkedAt),
      await this.checkQueueBackend(checkedAt),
      this.checkAuthSecret(checkedAt),
      this.checkPublicCallbackUrls(checkedAt),
      ...PUBLISHING_PROVIDER_ENV_DESCRIPTORS.map((descriptor) =>
        this.checkProvider(descriptor, checkedAt),
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

  private async checkDatabase(checkedAt: string): Promise<CheckDraft> {
    const draft: CheckDraft = {
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

  private async checkQueueBackend(checkedAt: string): Promise<CheckDraft> {
    const draft: CheckDraft = {
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

  private checkAuthSecret(checkedAt: string): CheckDraft {
    const draft: CheckDraft = {
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

  private checkPublicCallbackUrls(checkedAt: string): CheckDraft {
    const draft: CheckDraft = {
      diagnostics: [],
      key: 'callback.public_urls',
      label: 'Public callback URLs',
      scope: 'callback',
      status: 'pass',
    };

    const origins: Array<{ envKey: string; url: string }> = [
      {
        envKey: 'GENFEEDAI_API_PUBLIC_URL',
        url: resolveOAuthIssuerUrl(this.configService),
      },
      {
        envKey: 'GENFEEDAI_APP_URL',
        url: resolveOAuthAppUrl(this.configService),
      },
    ];

    const isCloud = isCloudDeployment();

    for (const origin of origins) {
      const parsed = this.parseAbsoluteUrl(origin.url);

      if (!parsed) {
        draft.status = 'fail';
        draft.diagnostics.push({
          checkedAt,
          classification: 'misconfiguration',
          code: 'callback_origin_invalid',
          correctiveAction: `Set ${origin.envKey} to an absolute origin, e.g. https://app.example.com.`,
          details: { envKey: origin.envKey },
          isRetryable: false,
          message: `${origin.envKey} is not an absolute URL, so OAuth callbacks cannot be built.`,
          scope: 'callback',
          severity: 'error',
        });
        continue;
      }

      if (!this.isLoopbackHost(parsed.hostname)) {
        continue;
      }

      draft.status = this.worstStatus(draft.status, isCloud ? 'fail' : 'warn');
      draft.diagnostics.push({
        checkedAt,
        classification: 'misconfiguration',
        code: 'callback_origin_not_publicly_reachable',
        correctiveAction: `Point ${origin.envKey} at the externally reachable origin registered with each provider.`,
        details: { envKey: origin.envKey },
        isRetryable: false,
        message: `${origin.envKey} resolves to a loopback host, which providers requiring a public callback will reject.`,
        scope: 'callback',
        severity: isCloud ? 'error' : 'warning',
      });
    }

    return draft;
  }

  private checkProvider(
    descriptor: PublishingProviderEnvDescriptor,
    checkedAt: string,
  ): CheckDraft {
    const draft: CheckDraft = {
      diagnostics: [],
      key: `provider.${descriptor.platform}`,
      label: `${descriptor.label} app credentials`,
      scope: 'provider',
      status: 'pass',
    };

    const missingEnvKeys = [
      ...this.findMissingRequirement(descriptor.clientIdKeys),
      ...this.findMissingRequirement(descriptor.clientSecretKeys),
    ];
    const configuredCount =
      Number(this.hasAnyConfigured(descriptor.clientIdKeys)) +
      Number(this.hasAnyConfigured(descriptor.clientSecretKeys));

    if (configuredCount === 0) {
      const isCloud = isCloudDeployment();
      draft.status = isCloud ? 'fail' : 'warn';
      draft.diagnostics.push({
        checkedAt,
        classification: 'unsupported_self_host_mode',
        code: 'provider_not_configured',
        correctiveAction: `Register a ${descriptor.label} developer app and set ${missingEnvKeys.join(', ')} to publish to it.`,
        details: { missingEnvKeys },
        isRetryable: false,
        message: `${descriptor.label} has no OAuth app credentials, so no account can be connected.`,
        scope: 'provider',
        severity: isCloud ? 'error' : 'warning',
      });

      return draft;
    }

    if (missingEnvKeys.length > 0) {
      draft.status = 'fail';
      draft.diagnostics.push({
        checkedAt,
        classification: 'misconfiguration',
        code: 'provider_partially_configured',
        correctiveAction: `Set ${missingEnvKeys.join(', ')} to complete the ${descriptor.label} app configuration.`,
        details: { missingEnvKeys },
        isRetryable: false,
        message: `${descriptor.label} is partially configured, which fails at connect time rather than at boot.`,
        scope: 'provider',
        severity: 'error',
      });
    }

    for (const envKey of descriptor.redirectUriKeys) {
      const value = this.readConfig(envKey);
      if (!value || this.parseAbsoluteUrl(value)) {
        continue;
      }

      draft.status = 'fail';
      draft.diagnostics.push({
        checkedAt,
        classification: 'misconfiguration',
        code: 'provider_redirect_uri_invalid',
        correctiveAction: `Set ${envKey} to the absolute callback URL registered in the ${descriptor.label} developer console.`,
        details: { envKey },
        isRetryable: false,
        message: `${descriptor.label} has a redirect URI that is not an absolute URL.`,
        scope: 'callback',
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

  private hasAnyConfigured(keys: readonly string[]): boolean {
    return keys.some((key) => this.readConfig(key) !== null);
  }

  /** Empty when the requirement is satisfied by any one of its keys. */
  private findMissingRequirement(keys: readonly string[]): string[] {
    return this.hasAnyConfigured(keys) ? [] : [...keys];
  }

  private parseAbsoluteUrl(value: string): URL | null {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }

  private isLoopbackHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return (
      LOOPBACK_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost')
    );
  }

  private worstStatus(
    current: PublishingSetupCheckStatus,
    candidate: PublishingSetupCheckStatus,
  ): PublishingSetupCheckStatus {
    if (current === 'fail' || candidate === 'fail') {
      return 'fail';
    }

    return current === 'warn' || candidate === 'warn' ? 'warn' : current;
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
