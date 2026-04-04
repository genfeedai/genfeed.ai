import type { IServiceSerializer } from '@genfeedai/interfaces/utils/error.interface';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

const workspaceTaskSerializer: IServiceSerializer<WorkspaceTask> = {
  serialize: (data) => data,
};

export type WorkspaceTaskExecutionPath =
  | 'agent_orchestrator'
  | 'caption_generation'
  | 'image_generation'
  | 'video_generation';

export type WorkspaceTaskOutputType =
  | 'caption'
  | 'image'
  | 'ingredient'
  | 'video';

export type WorkspaceTaskPriority = 'high' | 'normal' | 'low';

export type WorkspaceTaskReviewState =
  | 'approved'
  | 'changes_requested'
  | 'dismissed'
  | 'none'
  | 'pending_approval';

export type WorkspaceTaskStatus =
  | 'completed'
  | 'dismissed'
  | 'failed'
  | 'in_progress'
  | 'needs_review'
  | 'triaged';

export interface CreateWorkspaceTaskInput {
  brand?: string;
  outputType?: WorkspaceTaskOutputType;
  platforms?: string[];
  priority?: WorkspaceTaskPriority;
  request: string;
  title?: string;
}

export interface ListWorkspaceTasksParams {
  limit?: number;
  page?: number;
  reviewState?: WorkspaceTaskReviewState;
  status?: WorkspaceTaskStatus;
  view?: 'all' | 'in_progress' | 'inbox';
}

export interface WorkspacePlanThreadResponse {
  created: boolean;
  seeded: boolean;
  threadId: string;
}

export class WorkspaceTask {
  id!: string;
  organization!: string;
  user!: string;
  brand?: string;
  title!: string;
  request!: string;
  outputType!: WorkspaceTaskOutputType;
  platforms!: string[];
  priority!: WorkspaceTaskPriority;
  status!: WorkspaceTaskStatus;
  reviewState!: WorkspaceTaskReviewState;
  executionPathUsed!: WorkspaceTaskExecutionPath;
  chosenModel?: string;
  chosenProvider?: string;
  routingSummary?: string;
  skillsUsed!: string[];
  skillVariantIds!: string[];
  reviewTriggered!: boolean;
  linkedRunIds!: string[];
  linkedOutputIds!: string[];
  linkedApprovalIds!: string[];
  linkedIssueId?: string;
  planningThreadId?: string;
  resultPreview?: string;
  failureReason?: string;
  requestedChangesReason?: string;
  completedAt?: string;
  dismissedAt?: string;
  createdAt?: string;
  updatedAt?: string;

  constructor(partial: Partial<WorkspaceTask>) {
    Object.assign(this, partial);
  }
}

export class WorkspaceTasksService extends BaseService<
  WorkspaceTask,
  CreateWorkspaceTaskInput,
  Partial<CreateWorkspaceTaskInput>
> {
  constructor(token: string) {
    super('/workspace-tasks', token, WorkspaceTask, workspaceTaskSerializer);
  }

  public static getInstance(token: string): WorkspaceTasksService {
    return BaseService.getDataServiceInstance(
      WorkspaceTasksService,
      token,
    ) as WorkspaceTasksService;
  }

  async list(params: ListWorkspaceTasksParams = {}): Promise<WorkspaceTask[]> {
    return this.findAll(params as Record<string, unknown>);
  }

  async createTask(input: CreateWorkspaceTaskInput): Promise<WorkspaceTask> {
    return this.post(input);
  }

  async getInbox(limit?: number): Promise<WorkspaceTask[]> {
    return this.list({ limit, view: 'inbox' });
  }

  async approve(id: string): Promise<WorkspaceTask> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/approve`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}/approve`)
        .then((response) => this.mapOne(response.data)),
    );
  }

  async requestChanges(id: string, reason: string): Promise<WorkspaceTask> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/request-changes`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}/request-changes`, { reason })
        .then((response) => this.mapOne(response.data)),
    );
  }

  async dismiss(id: string, reason?: string): Promise<WorkspaceTask> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/dismiss`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}/dismiss`, { reason })
        .then((response) => this.mapOne(response.data)),
    );
  }

  async ensurePlanningThread(id: string): Promise<WorkspacePlanThreadResponse> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/${id}/plan-thread`,
      this.instance
        .post<WorkspacePlanThreadResponse>(`/${id}/plan-thread`)
        .then((response) => response.data),
    );
  }

  async createFollowUpTasks(id: string): Promise<WorkspaceTask[]> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/${id}/follow-up-tasks`,
      this.instance
        .post<JsonApiResponseDocument>(`/${id}/follow-up-tasks`)
        .then((response) => this.mapMany(response.data)),
    );
  }
}
