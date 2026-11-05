import { AgentTransferExecutionListener } from '@api/collections/agent-transfers/listeners/agent-transfer-execution.listener';
import { AgentTransferMediaOutputListener } from '@api/collections/agent-transfers/listeners/agent-transfer-media-output.listener';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Settles an agent transfer, and tells its master thread, when the child's
 * execution ends, or when the last image or video it made finishes rendering.
 * Events are process-local and executions and renders settle in both the API
 * and the workers, so every process imports this module; it is
 * the only place the listeners are provided, so each process subscribes once.
 */
@Module({
  imports: [LoggerModule],
  providers: [AgentTransferExecutionListener, AgentTransferMediaOutputListener],
})
export class AgentTransferRollupModule {}
