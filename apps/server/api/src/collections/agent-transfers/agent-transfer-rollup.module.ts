import { AgentTransferExecutionListener } from '@api/collections/agent-transfers/listeners/agent-transfer-execution.listener';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Settles an agent transfer, and tells its master thread, when the child's
 * execution ends. Events are process-local and executions settle in both the
 * API (cancel) and the workers, so every process imports this module; it is
 * the only place the listener is provided, so each process subscribes once.
 */
@Module({
  imports: [LoggerModule],
  providers: [AgentTransferExecutionListener],
})
export class AgentTransferRollupModule {}
