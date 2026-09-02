import type { WorkflowStatus } from '../..';
import type { IBaseEntity } from '../index';

export interface IWorkflow extends IBaseEntity {
  label: string;
  key: string;
  tasks: string[];
  trigger?: string;
  description?: string;
  status: WorkflowStatus;
}

export interface WorkflowTriggerQueueOptions {
  jobId?: string;
}
