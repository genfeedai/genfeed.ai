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

export interface ListWorkspaceActivityParams {
  activeOnly?: boolean;
  limit?: number;
  page?: number;
}

/**
 * Workspace app reads and the one task write: `/tasks`, `/review-inbox` and
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

  listInbox(): Promise<Array<Record<string, unknown>>> {
    this.base.logger.debug('Listing review inbox');

    return this.base.request(
      'listing review inbox',
      async (http) => {
        const response = await http.get('/review-inbox');
        return this.base.unwrapList<Record<string, unknown>>(response);
      },
      this.base.failWith('Failed to list the review inbox'),
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
