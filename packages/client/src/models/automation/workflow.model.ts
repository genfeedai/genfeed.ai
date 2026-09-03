import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { WorkflowStatus } from '@genfeedai/contracts';
import type {
  IWorkflow,
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowVisualNode,
} from '@genfeedai/contracts/interfaces';

export class Workflow extends BaseEntity implements IWorkflow {
  declare public label: string;
  declare public key: string;
  declare public tasks: string[];
  declare public trigger?: string;
  declare public description?: string;
  declare public status: WorkflowStatus;
  declare public nodes?: WorkflowVisualNode[];
  declare public edges?: WorkflowEdge[];
  declare public inputVariables?: WorkflowInputVariable[];
  declare public metadata?: Record<string, unknown>;
  declare public schedule?: string;
  declare public timezone?: string;
  declare public isScheduleEnabled?: boolean;

  constructor(data: Partial<IWorkflow> = {}) {
    super(data);
  }
}
