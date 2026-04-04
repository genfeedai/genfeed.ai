export type WorkflowStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed';

export type WorkflowStepType =
  | 'generate_article'
  | 'generate_image'
  | 'generate_video'
  | 'generate_music'
  | 'generate_avatar'
  | 'create_post'
  | 'wait'
  | 'condition';

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  config: Record<string, unknown>;
  order: number;
}

export interface WorkflowCreateParams {
  name: string;
  description?: string;
  templateId?: string;
  steps?: WorkflowStep[];
  schedule?: {
    type: 'once' | 'daily' | 'weekly' | 'monthly';
    startAt?: string;
    timezone?: string;
  };
}

export interface WorkflowResponse {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  currentStepIndex?: number;
  createdAt: string;
  updatedAt?: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface WorkflowExecuteParams {
  workflowId: string;
  variables?: Record<string, unknown>;
}

export interface WorkflowExecutionResult {
  executionId: string;
  workflowId: string;
  status: 'started' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  results?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowListParams {
  status?: WorkflowStatus;
  limit?: number;
  offset?: number;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: WorkflowStep[];
  estimatedDuration?: string;
  creditsRequired?: number;
}
