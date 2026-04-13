import type { IServiceSerializer } from '@genfeedai/interfaces/utils/error.interface';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export type TaskStatus =
  | 'backlog'
  | 'blocked'
  | 'cancelled'
  | 'done'
  | 'failed'
  | 'in_progress'
  | 'in_review'
  | 'todo';

export type TaskPriority = 'critical' | 'high' | 'low' | 'medium';

export type TaskLinkedEntityModel =
  | 'Article'
  | 'Evaluation'
  | 'Ingredient'
  | 'Post';

export type TaskExecutionPath =
  | 'agent_orchestrator'
  | 'caption_generation'
  | 'image_generation'
  | 'video_generation';

export type TaskOutputType =
  | 'caption'
  | 'facecam'
  | 'image'
  | 'ingredient'
  | 'newsletter'
  | 'post'
  | 'video';

export type TaskReviewState =
  | 'approved'
  | 'changes_requested'
  | 'dismissed'
  | 'none'
  | 'pending_approval';

export interface TaskLinkedEntity {
  entityId: string;
  entityModel: TaskLinkedEntityModel;
}

export interface TaskPlanThreadResponse {
  created: boolean;
  seeded: boolean;
  threadId: string;
}

export interface TaskQualityAssessmentDimension {
  label: string;
  notes?: string;
  score: number;
}

export interface TaskQualityAssessment {
  dimensions: TaskQualityAssessmentDimension[];
  gate: 'fail' | 'needs_revision' | 'pass';
  repairLoopUsed: boolean;
  rubricVersion: string;
  score: number;
  suggestedFixes: string[];
  summary?: string;
  winnerSummary?: string;
}

export interface TaskProgress {
  activeRunCount: number;
  message?: string;
  percent: number;
  stage?: string;
}

export interface TaskEvent {
  id: string;
  payload?: Record<string, unknown>;
  timestamp: string;
  type: string;
}

export interface CreateTaskInput {
  assigneeAgentId?: string;
  assigneeUserId?: string;
  brand?: string;
  description?: string;
  goalId?: string;
  heygenAvatarId?: string;
  heygenVoiceId?: string;
  linkedEntities?: TaskLinkedEntity[];
  outputType?: TaskOutputType;
  parentId?: string;
  platforms?: string[];
  priority?: TaskPriority;
  projectId?: string;
  request?: string;
  status?: TaskStatus;
  title: string;
}

export interface ListTasksParams {
  assigneeAgentId?: string;
  assigneeUserId?: string;
  limit?: number;
  page?: number;
  parentId?: string;
  priority?: TaskPriority;
  reviewState?: TaskReviewState;
  sort?: string;
  status?: TaskStatus;
  view?: 'all' | 'inbox' | 'in_progress';
}

const taskSerializer: IServiceSerializer<Task> = {
  serialize: (data) => data,
};

export class Task {
  id!: string;
  organization!: string;
  brand?: string;
  taskNumber!: number;
  identifier!: string;
  title!: string;
  description?: string;
  status!: TaskStatus;
  priority!: TaskPriority;
  parentId?: string;
  projectId?: string;
  goalId?: string;
  assigneeUserId?: string;
  assigneeAgentId?: string;
  checkoutRunId?: string;
  checkoutAgentId?: string;
  checkedOutAt?: string;
  linkedEntities!: TaskLinkedEntity[];

  // AI execution fields
  request?: string;
  outputType?: TaskOutputType;
  platforms?: string[];
  reviewState?: TaskReviewState;
  executionPathUsed?: TaskExecutionPath;
  chosenModel?: string;
  chosenProvider?: string;
  routingSummary?: string;
  skillsUsed?: string[];
  skillVariantIds?: string[];
  reviewTriggered?: boolean;
  linkedRunIds?: string[];
  linkedOutputIds?: string[];
  approvedOutputIds?: string[];
  linkedApprovalIds?: string[];
  linkedIssueId?: string;
  planningThreadId?: string;
  resultPreview?: string;
  qualityAssessment?: TaskQualityAssessment;
  progress?: TaskProgress;
  eventStream?: TaskEvent[];
  failureReason?: string;
  requestedChangesReason?: string;
  dismissedReason?: string;
  decomposition?: Record<string, unknown>;
  completedAt?: string;
  dismissedAt?: string;

  isDeleted!: boolean;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<Task>) {
    Object.assign(this, partial);
  }

  get isOpen(): boolean {
    return !['done', 'cancelled'].includes(this.status);
  }

  get isBlocked(): boolean {
    return this.status === 'blocked';
  }
}

export class TasksService extends BaseService<
  Task,
  CreateTaskInput,
  Partial<CreateTaskInput>
> {
  constructor(token: string) {
    super('/tasks', token, Task, taskSerializer);
  }

  public static getInstance(token: string): TasksService {
    return BaseService.getDataServiceInstance(
      TasksService,
      token,
    ) as TasksService;
  }

  async list(params: ListTasksParams = {}): Promise<Task[]> {
    return this.findAll(params as Record<string, unknown>);
  }

  async getByIdentifier(identifier: string): Promise<Task> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/by-identifier/${identifier}`,
      this.instance
        .get<JsonApiResponseDocument>(`/by-identifier/${identifier}`)
        .then((res) => res.data)
        .then(async (res) => await this.mapOne(res)),
    );
  }

  async getChildren(taskId: string): Promise<Task[]> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/${taskId}/children`,
      this.instance
        .get<JsonApiResponseDocument>(`/${taskId}/children`)
        .then((res) => res.data)
        .then(async (res) => await this.mapMany(res)),
    );
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    return this.post(input);
  }

  async updateTask(id: string, input: Partial<CreateTaskInput>): Promise<Task> {
    return this.patch(id, input);
  }

  async getInbox(limit?: number): Promise<Task[]> {
    return this.list({ limit, view: 'inbox' } as ListTasksParams);
  }

  async approve(id: string): Promise<Task> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/approve`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}/approve`)
        .then((response) => this.mapOne(response.data)),
    );
  }

  async requestChanges(id: string, reason: string): Promise<Task> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/request-changes`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}/request-changes`, { reason })
        .then((response) => this.mapOne(response.data)),
    );
  }

  async dismiss(id: string, reason?: string): Promise<Task> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/dismiss`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}/dismiss`, { reason })
        .then((response) => this.mapOne(response.data)),
    );
  }

  async ensurePlanningThread(id: string): Promise<TaskPlanThreadResponse> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/${id}/plan-thread`,
      this.instance
        .post<TaskPlanThreadResponse>(`/${id}/plan-thread`)
        .then((response) => response.data),
    );
  }

  async createChildTasks(id: string): Promise<Task[]> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/${id}/children`,
      this.instance
        .post<JsonApiResponseDocument>(`/${id}/children`)
        .then((response) => this.mapMany(response.data)),
    );
  }

  async keepOutput(id: string, outputId: string): Promise<Task> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/outputs/${outputId}/keep`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}/outputs/${outputId}/keep`)
        .then((response) => this.mapOne(response.data)),
    );
  }

  async unkeepOutput(id: string, outputId: string): Promise<Task> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/outputs/${outputId}/unkeep`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}/outputs/${outputId}/unkeep`)
        .then((response) => this.mapOne(response.data)),
    );
  }

  async trashOutput(id: string, outputId: string): Promise<Task> {
    return this.executeWithErrorHandling(
      `PATCH ${this.baseURL}/${id}/outputs/${outputId}/trash`,
      this.instance
        .patch<JsonApiResponseDocument>(`/${id}/outputs/${outputId}/trash`)
        .then((response) => this.mapOne(response.data)),
    );
  }
}
