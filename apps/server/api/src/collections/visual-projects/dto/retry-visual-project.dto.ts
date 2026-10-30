import type { IRetryVisualProject } from '@genfeedai/contracts/interfaces';
import { Allow } from 'class-validator';
export class RetryVisualProjectDto implements IRetryVisualProject {
  @Allow()
  declare readonly requestId: string;
  @Allow()
  declare readonly revision: number;
  @Allow()
  declare readonly expectedRevision: number;
  @Allow()
  declare readonly maximumCredits: number;
}
