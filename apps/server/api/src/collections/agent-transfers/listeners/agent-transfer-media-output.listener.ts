import { settleAgentTransferMediaOutput } from '@api/collections/agent-transfers/services/agent-transfer-settlement.util';
import {
  GENERATION_OUTPUT_TERMINAL_EVENT,
  type GenerationOutputTerminalEvent,
} from '@api/collections/credits/constants/generation-output-events.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Finishes a transfer whose child ended while its image or video was still
 * rendering, once that render ends. Credits sit below transfers, so the
 * billing step emits rather than calls. An output no transfer waits on is
 * ignored.
 */
@Traced()
@Injectable()
export class AgentTransferMediaOutputListener {
  private readonly context = { service: AgentTransferMediaOutputListener.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(GENERATION_OUTPUT_TERMINAL_EVENT)
  async handleOutputTerminal(
    event: GenerationOutputTerminalEvent,
  ): Promise<void> {
    try {
      await settleAgentTransferMediaOutput(this.prisma, event);
    } catch (error: unknown) {
      this.logger.error('Failed to settle agent transfer for media output', {
        ...this.context,
        error,
        ingredientId: event.ingredientId,
        organizationId: event.organizationId,
      });
    }
  }
}
