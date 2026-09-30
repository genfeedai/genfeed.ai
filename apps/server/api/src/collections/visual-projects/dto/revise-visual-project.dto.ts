import type {
  IReviseVisualProject,
  VisualCodeJson,
} from '@genfeedai/contracts/interfaces';
import { Allow } from 'class-validator';
export class ReviseVisualProjectDto implements IReviseVisualProject {
  @Allow()
  declare readonly requestId: string;
  @Allow()
  declare readonly expectedRevision: number;
  @Allow()
  declare readonly prompt?: string;
  @Allow()
  declare readonly sourceCode?: string;
  @Allow()
  declare readonly props?: Record<string, VisualCodeJson>;
  @Allow()
  declare readonly maximumCredits: number;
}
