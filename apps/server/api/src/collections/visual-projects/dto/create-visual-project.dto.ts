import type {
  ICreateVisualProject,
  IVisualCodeOutputRequest,
  IVisualCodeSettings,
  VisualCodeJson,
} from '@genfeedai/contracts/interfaces';
import { Allow } from 'class-validator';
export class CreateVisualProjectDto implements ICreateVisualProject {
  @Allow()
  declare readonly brandId: string;
  @Allow()
  declare readonly requestId: string;
  @Allow()
  declare readonly label: string;
  @Allow()
  declare readonly prompt?: string;
  @Allow()
  declare readonly sourceCode?: string;
  @Allow()
  declare readonly modelKey?: string;
  @Allow()
  declare readonly settings: IVisualCodeSettings;
  @Allow()
  declare readonly props?: Record<string, VisualCodeJson>;
  @Allow()
  declare readonly sourceAssetIds?: string[];
  @Allow()
  declare readonly outputs?: IVisualCodeOutputRequest[];
  @Allow()
  declare readonly maximumCredits: number;
}
