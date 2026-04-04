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
  | 'in_progress'
  | 'in_review'
  | 'todo';

export type TaskPriority = 'critical' | 'high' | 'low' | 'medium';

export type TaskLinkedEntityModel =
  | 'Article'
  | 'Evaluation'
  | 'Ingredient'
  | 'Post';

export interface TaskLinkedEntity {
  entityId: string;
  entityModel: TaskLinkedEntityModel;
}

export interface CreateTaskInput {
  assigneeAgentId?: string;
  assigneeUserId?: string;
  description?: string;
  goalId?: string;
  linkedEntities?: TaskLinkedEntity[];
  parentId?: string;
  priority?: TaskPriority;
  projectId?: string;
  status?: TaskStatus;
  title: string;
}

export interface ListTasksParams {
  assigneeAgentId?: string;
  assigneeUserId?: string;
  page?: number;
  parentId?: string;
  priority?: TaskPriority;
  sort?: string;
  status?: TaskStatus;
}

const taskSerializer: IServiceSerializer<Task> = {
  serialize: (data) => data,
};

export class Task {
  id!: string;
  organization!: string;
  brand?: string;
  issueNumber!: number;
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
}
