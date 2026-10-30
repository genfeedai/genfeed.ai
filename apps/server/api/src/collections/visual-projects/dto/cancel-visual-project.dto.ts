import type { ICancelVisualProject } from '@genfeedai/contracts/interfaces';
import { Allow } from 'class-validator';
export class CancelVisualProjectDto implements ICancelVisualProject {
  @Allow()
  declare readonly revision: number;
}
