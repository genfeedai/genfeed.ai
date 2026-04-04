import { WorkflowStatus } from '@genfeedai/enums';
import type { IBaseEntity } from '../index';

export interface IWorkflow extends IBaseEntity {
  label: string;
  key: string;
  tasks: string[];
  trigger?: string;
  description?: string;
  status: WorkflowStatus;
}
