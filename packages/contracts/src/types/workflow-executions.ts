export interface WorkflowExecutionListQueryParams {
  brandId?: string;
  limit?: number;
  offset?: number;
  sort?: string;
  status?: string;
  trigger?: string;
  workflowId?: string;
}

export interface WorkflowExecutionStats {
  active: number;
  completed: number;
  failed: number;
  total: number;
  totalCredits: number;
}
