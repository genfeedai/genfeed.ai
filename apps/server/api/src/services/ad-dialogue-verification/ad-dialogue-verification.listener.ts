import {
  GENERATION_OUTPUT_TERMINAL_EVENT,
  type GenerationOutputTerminalEvent,
} from '@api/collections/credits/constants/generation-output-events.constants';
import { AdDialogueVerificationService } from '@api/services/ad-dialogue-verification/ad-dialogue-verification.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Starts the dialogue check when an ad preset output is delivered. Credits sit
 * below this service, so the billing step emits rather than calls. An output
 * with no pending check is ignored; a failure is logged and never reaches the
 * billing step.
 */
@Traced()
@Injectable()
export class AdDialogueVerificationListener {
  private readonly context = { service: AdDialogueVerificationListener.name };

  constructor(
    private readonly verification: AdDialogueVerificationService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(GENERATION_OUTPUT_TERMINAL_EVENT)
  async handleOutputTerminal(
    event: GenerationOutputTerminalEvent,
  ): Promise<void> {
    if (event.outcome !== 'settled') return;
    try {
      await this.verification.verify(event.organizationId, event.ingredientId);
    } catch (error: unknown) {
      this.logger.error('Failed to verify ad dialogue', {
        ...this.context,
        error,
        ingredientId: event.ingredientId,
        organizationId: event.organizationId,
      });
    }
  }
}
