import type {
  IExportVisualProject,
  IVisualCodeOutputRequest,
} from '@genfeedai/contracts/interfaces';
import { Allow } from 'class-validator';
export class ExportVisualProjectDto implements IExportVisualProject {
  @Allow()
  declare readonly requestId: string;
  @Allow()
  declare readonly revision: number;
  @Allow()
  declare readonly expectedRevision: number;
  @Allow()
  declare readonly outputs: IVisualCodeOutputRequest[];
  @Allow()
  declare readonly maximumCredits: number;
}
