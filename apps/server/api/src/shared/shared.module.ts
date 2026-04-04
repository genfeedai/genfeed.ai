import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MembersModule } from '@api/collections/members/members.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { PromptsModule } from '@api/collections/prompts/prompts.module';
import { UsersModule } from '@api/collections/users/users.module';
import { ConfigModule } from '@api/config/config.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { TaskQueueClientService } from '@api/services/task-queue-client/task-queue-client.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpModule, HttpService } from '@nestjs/axios';
import {
  forwardRef,
  Global,
  Injectable,
  Module,
  type OnModuleInit,
} from '@nestjs/common';
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
        const url = error.config?.url ?? '?';
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
    NotificationsPublisherModule,

    forwardRef(() => IngredientsModule),
    forwardRef(() => MembersModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => PromptsModule),
    forwardRef(() => UsersModule),
  ],
  providers: [
    AxiosErrorInterceptorSetup,
    SharedService,
    TaskQueueClientService,
  ],
})
export class SharedModule {}
