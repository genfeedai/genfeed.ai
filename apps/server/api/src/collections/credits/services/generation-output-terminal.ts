import {
  GENERATION_OUTPUT_TERMINAL_EVENT,
  type GenerationOutputTerminalEvent,
} from '@api/collections/credits/constants/generation-output-events.constants';
import type { MediaGenerationReceiptsService } from '@api/services/media-generation-receipts/media-generation-receipts.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * The terminal side of a generation output's settle or release: it syncs the
 * output's receipt, and once the hold step has run, announces the outcome so
 * work waiting on the render (an agent hand-off) can finish.
 */
export class GenerationOutputTerminal {
  constructor(
    private readonly logger: LoggerService,
    private readonly receipts?: MediaGenerationReceiptsService,
    private readonly events?: EventEmitter2,
  ) {}

  async track<T>(
    ingredientId: string,
    organizationId: string,
    outcome: GenerationOutputTerminalEvent['outcome'],
    step: () => Promise<T>,
  ): Promise<T> {
    const signal = outcome === 'settled' ? 'settled' : 'released';
    void this.receipts?.syncTerminal(organizationId, ingredientId, signal);
    try {
      return await step();
    } finally {
      this.announce({ ingredientId, organizationId, outcome });
    }
  }

  /** Emitting never throws into the billing step. */
  private announce(event: GenerationOutputTerminalEvent): void {
    try {
      this.events?.emit(GENERATION_OUTPUT_TERMINAL_EVENT, event);
    } catch (error: unknown) {
      this.logger.warn('Failed to emit generation output terminal event', {
        error,
        ingredientId: event.ingredientId,
        organizationId: event.organizationId,
      });
    }
  }
}
