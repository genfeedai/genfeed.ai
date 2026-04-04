import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { WorkflowStatus } from '@genfeedai/enums';
import type {
  IWorkflow,
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowVisualNode,
} from '@genfeedai/interfaces';

export class Workflow extends BaseEntity implements IWorkflow {
  public declare label: string;
  public declare key: string;
  public declare tasks: string[];
  public declare trigger?: string;
  public declare description?: string;
  public declare status: WorkflowStatus;
  public declare nodes?: WorkflowVisualNode[];
  public declare edges?: WorkflowEdge[];
  public declare inputVariables?: WorkflowInputVariable[];
  public declare metadata?: Record<string, unknown>;
  public declare schedule?: string;
  public declare timezone?: string;
  public declare isScheduleEnabled?: boolean;

  constructor(data: Partial<IWorkflow> = {}) {
    super(data);
  }
}
