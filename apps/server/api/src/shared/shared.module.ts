import { MembersModule } from '@api/collections/members/members.module';
import { DEFAULT_HTTP_TIMEOUT_MS } from '@api/constants/http-timeout.constant';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { TaskQueueClientService } from '@api/services/task-queue-client/task-queue-client.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { redactSensitiveString } from '@genfeedai/helpers/security/redact-sensitive-value.helper';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpModule, HttpService } from '@nestjs/axios';
import { Global, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import type { AxiosError } from 'axios';

/**
 * Statuses that say our own credential, plan or quota with the provider is the
 * problem. They stay errors; every other 4xx is the request the caller sent and
 * the caller decides what it means.
 */
const UPSTREAM_ACCOUNT_STATUSES = new Set([401, 402, 403, 429]);

@Injectable()
export class AxiosErrorInterceptorSetup implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit() {
    this.httpService.axiosRef.interceptors.response.use(
      undefined,
      (error: AxiosError) => {
        const method = error.config?.method?.toUpperCase() ?? '?';
        // A request URL can carry a provider secret in its path (Discord
        // webhooks, Telegram bot tokens). Redact it on the error itself, which
        // goes on to the logger and Sentry.
        const url = redactSensitiveString(error.config?.url ?? '?');
        if (error.config) {
          error.config.url = url;
        }
        const status = error.response?.status ?? 'network error';

        // The interceptor sees every non-2xx and cannot tell a refused request
        // (a 400 or 404 the caller handles) from a fault. Only the caller can,
        // so a plain upstream 4xx is a warning and its caller reports a real
        // failure itself. 5xx, network errors and account-level statuses stay
        // errors.
        const isCallerRefusal =
          typeof error.response?.status === 'number' &&
          error.response.status >= 400 &&
          error.response.status < 500 &&
          !UPSTREAM_ACCOUNT_STATUSES.has(error.response.status);
        const message = `HTTP ${method} ${url} → ${status}`;
        const logContext = {
          operation: 'response',
          service: 'AxiosInterceptor',
        };
        if (isCallerRefusal) {
          this.logger.warn(message, { ...logContext, message: error.message });
        } else {
          this.logger.error(message, error, logContext);
        }

        return Promise.reject(error);
      },
    );
  }
}

@Global()
@Module({
  exports: [
    ConfigModule,
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    MembersModule,
    NotificationsPublisherModule,
    SharedService,
    TaskQueueClientService,
  ],
  imports: [
    ConfigModule,
    HttpModule.register({ timeout: DEFAULT_HTTP_TIMEOUT_MS }),
    MembersModule,
    NotificationsPublisherModule,
  ],
  providers: [
    AxiosErrorInterceptorSetup,
    SharedService,
    TaskQueueClientService,
  ],
})
export class SharedModule {}
