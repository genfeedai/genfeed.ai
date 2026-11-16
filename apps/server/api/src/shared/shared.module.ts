import { MembersModule } from '@api/collections/members/members.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { TaskQueueClientService } from '@api/services/task-queue-client/task-queue-client.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { redactSensitiveString } from '@genfeedai/helpers/security/redact-sensitive-value.helper';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpModule, HttpService } from '@nestjs/axios';
import { Global, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import type { AxiosError } from 'axios';

@Injectable()
class AxiosErrorInterceptorSetup implements OnModuleInit {
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

        this.logger.error(`HTTP ${method} ${url} → ${status}`, error, {
          operation: 'response',
          service: 'AxiosInterceptor',
        });

        return Promise.reject(error);
      },
    );
  }
}

@Global()
@Module({
  exports: [
    ConfigModule,
    HttpModule,
    MembersModule,
    NotificationsPublisherModule,
    SharedService,
    TaskQueueClientService,
  ],
  imports: [
    ConfigModule,
    HttpModule,
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
