export interface WorkflowExecutionListQueryParams {
  brandId?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  status?: string;
  strategyId?: string;
  trigger?: string;
  workflowId?: string;
}

export interface WorkflowExecutionStats {
  active: number;
  completed: number;
  completedToday: number;
  failed: number;
  failedToday: number;
  total: number;
  totalCredits: number;
}

export interface WorkflowExecutionSummaryQueryParams
  extends Omit<WorkflowExecutionListQueryParams, 'limit' | 'offset' | 'sort'> {
  dayStart: string;
  dayEnd: string;
}
