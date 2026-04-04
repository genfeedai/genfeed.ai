import type { IServiceSerializer } from '@cloud/interfaces/utils/error.interface';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export type IssueStatus =
  | 'backlog'
  | 'blocked'
  | 'cancelled'
  | 'done'
  | 'in_progress'
  | 'in_review'
  | 'todo';

export type IssuePriority = 'critical' | 'high' | 'low' | 'medium';

export type IssueLinkedEntityModel =
  | 'Article'
  | 'Evaluation'
  | 'Ingredient'
  | 'Post';

export interface IssueLinkedEntity {
  entityId: string;
  entityModel: IssueLinkedEntityModel;
}

export interface CreateIssueInput {
  assigneeAgentId?: string;
  assigneeUserId?: string;
  description?: string;
  goalId?: string;
  linkedEntities?: IssueLinkedEntity[];
  parentId?: string;
  priority?: IssuePriority;
  projectId?: string;
  status?: IssueStatus;
  title: string;
}

export interface ListIssuesParams {
  assigneeAgentId?: string;
  assigneeUserId?: string;
  page?: number;
  parentId?: string;
  priority?: IssuePriority;
  sort?: string;
  status?: IssueStatus;
}

const issueSerializer: IServiceSerializer<Issue> = {
  serialize: (data) => data,
};

export class Issue {
  id!: string;
  organization!: string;
  brand?: string;
  issueNumber!: number;
  identifier!: string;
  title!: string;
  description?: string;
  status!: IssueStatus;
  priority!: IssuePriority;
  parentId?: string;
  projectId?: string;
  goalId?: string;
  assigneeUserId?: string;
  assigneeAgentId?: string;
  checkoutRunId?: string;
  checkoutAgentId?: string;
  checkedOutAt?: string;
  linkedEntities!: IssueLinkedEntity[];
  isDeleted!: boolean;
  createdAt!: string;
  updatedAt!: string;

  constructor(partial: Partial<Issue>) {
    Object.assign(this, partial);
  }

  get isOpen(): boolean {
    return !['done', 'cancelled'].includes(this.status);
  }

  get isBlocked(): boolean {
    return this.status === 'blocked';
  }
}

export class IssuesService extends BaseService<
  Issue,
  CreateIssueInput,
  Partial<CreateIssueInput>
> {
  constructor(token: string) {
    super('/issues', token, Issue, issueSerializer);
  }

  public static getInstance(token: string): IssuesService {
    return BaseService.getDataServiceInstance(
      IssuesService,
      token,
    ) as IssuesService;
  }

  async list(params: ListIssuesParams = {}): Promise<Issue[]> {
    return this.findAll(params as Record<string, unknown>);
  }

  async getByIdentifier(identifier: string): Promise<Issue> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/by-identifier/${identifier}`,
      this.instance
        .get<JsonApiResponseDocument>(`/by-identifier/${identifier}`)
        .then((res) => res.data)
        .then(async (res) => await this.mapOne(res)),
    );
  }

  async getChildren(issueId: string): Promise<Issue[]> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/${issueId}/children`,
      this.instance
        .get<JsonApiResponseDocument>(`/${issueId}/children`)
        .then((res) => res.data)
        .then(async (res) => await this.mapMany(res)),
    );
  }

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    return this.post(input);
  }

  async updateIssue(
    id: string,
    input: Partial<CreateIssueInput>,
  ): Promise<Issue> {
    return this.patch(id, input);
  }
}
