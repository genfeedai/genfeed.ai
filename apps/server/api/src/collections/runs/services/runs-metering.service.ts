import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  RunActionType,
  RunAuthType,
  RunMeteringStage,
  RunStatus,
  RunSurface,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface RunMeteringPayload {
  actionType: RunActionType;
  authType: RunAuthType;
  organizationId: string;
  progress: number;
  runId: string;
  stage: RunMeteringStage;
  status: RunStatus;
  surface: RunSurface;
  traceId: string;
  userId: string;
}

@Injectable()
export class RunsMeteringService {
  constructor(
    private readonly logger: LoggerService,
    private readonly notificationsPublisher: NotificationsPublisherService,
  ) {}

  async record(payload: RunMeteringPayload): Promise<void> {
    const meteringEvent = {
      ...payload,
      emittedAt: new Date().toISOString(),
      pricingModel: 'plan_and_usage_credits',
    };

    try {
      await this.notificationsPublisher.emit(
        `/runs/${payload.runId}/metering`,
        meteringEvent,
      );
    } catch (error: unknown) {
      this.logger.warn('Run metering hook failed', {
        error: error instanceof Error ? error.message : String(error),
        payload,
      });
      return;
    }

    this.logger.debug('Run metering hook fired', meteringEvent);
  }
}
