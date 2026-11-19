import type {
  ITurboRunSummary,
  TaskPriority,
  TaskStatus,
} from '@genfeedai/contracts/interfaces';
import type { BaseApiClient } from './base-api-client';

export interface ListWorkspaceTasksParams {
  limit?: number;
  page?: number;
  priority?: string;
  status?: string;
}

export interface CreateWorkspaceTaskParams {
  description?: string;
  priority?: string;
  status?: string;
  title: string;
}

export interface UpdateWorkspaceTaskParams {
  assigneeUserId?: string | null;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  title?: string;
}

export interface ListWorkspaceActivityParams {
  activeOnly?: boolean;
  limit?: number;
  page?: number;
}

type ReviewRunResource = {
  id: string;
  attributes: Pick<ITurboRunSummary, 'items'>;
};

/**
 * Workspace app reads and writes: `/tasks`, `/review-inbox` and
 * `/activities`. Thin proxies; the caller's bearer token carries organization
 * and brand, so tenant isolation is inherited from the API guards.
 */
export class WorkspaceAppClient {
  constructor(private readonly base: BaseApiClient) {}

  listTasks(
    params: ListWorkspaceTasksParams = {},
  ): Promise<Array<Record<string, unknown>>> {
    this.base.logger.debug('Listing workspace tasks', { params });

    return this.base.request(
      'listing workspace tasks',
      async (http) => {
        const response = await http.get('/tasks', {
          params: {
            limit: params.limit ?? 10,
            page: params.page ?? 1,
            priority: params.priority,
            status: params.status,
          },
        });
        return this.base.unwrapList<Record<string, unknown>>(response);
      },
      this.base.failWith('Failed to list workspace tasks'),
    );
  }

  getTask(taskId: string): Promise<Record<string, unknown>> {
    this.base.logger.debug(`Getting workspace task: ${taskId}`);

    return this.base.request(
      'getting workspace task',
      async (http) => {
        const response = await http.get(`/tasks/${encodeURIComponent(taskId)}`);
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to get workspace task'),
    );
  }

  createTask(
    params: CreateWorkspaceTaskParams,
  ): Promise<Record<string, unknown>> {
    this.base.logger.debug('Creating workspace task', {
      title: params.title,
    });

    return this.base.request(
      'creating workspace task',
      async (http) => {
        const response = await http.post('/tasks', {
          description: params.description,
          priority: params.priority,
          status: params.status,
          title: params.title,
        });
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to create workspace task'),
    );
  }

  updateTask(
    taskId: string,
    params: UpdateWorkspaceTaskParams,
  ): Promise<Record<string, unknown>> {
    return this.base.request(
      'updating workspace task',
      async (http) => {
        const response = await http.patch(
          `/tasks/${encodeURIComponent(taskId)}`,
          params,
        );
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to update workspace task'),
    );
  }

  commentOnTask(
    taskId: string,
    body: string,
  ): Promise<Record<string, unknown>> {
    return this.base.request(
      'commenting on workspace task',
      async (http) => {
        const response = await http.post(
          `/tasks/${encodeURIComponent(taskId)}/comments`,
          { body },
        );
        return this.base.unwrapObject(response);
      },
      this.base.failWithDetail('Failed to comment on workspace task'),
    );
  }

  listInbox(brandId?: string): Promise<Array<Record<string, unknown>>> {
    this.base.logger.debug('Listing review inbox');

    return this.base.request(
      'listing review inbox',
      async (http) => {
        const response = brandId
          ? await http.get('/review-inbox', { params: { brandId } })
          : await http.get('/review-inbox');
        return this.base.unwrapList<Record<string, unknown>>(response);
      },
      this.base.failWithDetail('Failed to list the review inbox'),
    );
  }

  getReviewRun(
    brandId?: string,
    turboRunId?: string,
  ): Promise<ReviewRunResource | undefined> {
    return this.base.request(
      'reading the Turbo review batch',
      async (http) => {
        if (turboRunId) {
          const response = await http.get(
            `/turbo-runs/${encodeURIComponent(turboRunId)}`,
            { params: { brandId } },
          );
          return this.base.unwrapObject<ReviewRunResource>(response);
        }
        const response = await http.get('/turbo-runs', {
          params: { brandId, limit: 1 },
        });
        return this.base.unwrapList<ReviewRunResource>(response)[0];
      },
      this.base.failWithDetail('Failed to read the Turbo review batch'),
    );
  }

  listActivity(
    params: ListWorkspaceActivityParams = {},
  ): Promise<Array<Record<string, unknown>>> {
    this.base.logger.debug('Listing activity', { params });

    return this.base.request(
      'listing activity',
      async (http) => {
        const response = await http.get('/activities', {
          params: {
            ...(params.activeOnly ? { activeOnly: true } : {}),
            limit: params.limit ?? 10,
            page: params.page ?? 1,
          },
        });
        return this.base.unwrapList<Record<string, unknown>>(response);
      },
      this.base.failWith('Failed to list activity'),
    );
  }
}
