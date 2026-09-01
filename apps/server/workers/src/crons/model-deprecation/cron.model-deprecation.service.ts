import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

interface DeprecationResult {
  deprecated: number;
  skippedDueToWorkflows: number;
  skippedDueToUsage: number;
  skippedDueToSuccessorAge: number;
  evaluated: number;
}

/**
 * Lifecycle transitions are operator-owned. The previous cron inferred usage
 * from model counts rather than generation data, so it is intentionally a
 * no-op until a real usage ledger and an explicit operator policy exist.
 */
@Injectable()
export class CronModelDeprecationService {
  constructor(private readonly logger: LoggerService) {}

  async deprecateSupersededModels(): Promise<DeprecationResult> {
    this.logger.log(
      'Automatic model lifecycle transitions are disabled; use Admin lifecycle controls',
    );
    return {
      deprecated: 0,
      evaluated: 0,
      skippedDueToSuccessorAge: 0,
      skippedDueToUsage: 0,
      skippedDueToWorkflows: 0,
    };
  }
}
