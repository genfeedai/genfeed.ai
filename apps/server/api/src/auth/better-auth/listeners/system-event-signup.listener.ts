import { BETTER_AUTH_USER_CREATED_EVENT } from '@api/auth/better-auth/better-auth.constants';
import type { IBetterAuthUserCreatedEvent } from '@api/auth/better-auth/better-auth.types';
import { SystemEventsService } from '@api/services/system-events/system-events.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class SystemEventSignupListener {
  constructor(
    private readonly events: SystemEventsService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(BETTER_AUTH_USER_CREATED_EVENT)
  async onSignup(event: IBetterAuthUserCreatedEvent): Promise<void> {
    try {
      await this.events.recordSignup(event.userId);
    } catch {
      this.logger.warn('Signup system event will be recovered by the worker');
    }
  }
}
