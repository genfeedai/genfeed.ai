import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { Task, TasksService } from '@services/management/tasks.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Task model', () => {
  it('isOpen is false for done and cancelled', () => {
    expect(new Task({ status: 'done' }).isOpen).toBe(false);
    expect(new Task({ status: 'cancelled' }).isOpen).toBe(false);
    expect(new Task({ status: 'todo' }).isOpen).toBe(true);
  });

  it('isBlocked only for blocked status', () => {
    expect(new Task({ status: 'blocked' }).isBlocked).toBe(true);
    expect(new Task({ status: 'todo' }).isBlocked).toBe(false);
  });
});

describe('TasksService', () => {
  const taskId = 'task_1';
  let service: TasksService;
  let http: MockHttpInstance;

  function mockTaskResponse(
    method: 'get' | 'patch' | 'post' | 'delete',
    id = taskId,
  ): void {
    http[method].mockResolvedValue(
      axiosResponse(resourceDocument({ title: 'Task' }, { id })),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TasksService('tasks-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = TasksService.getInstance('tok');
    expect(TasksService.getInstance('tok')).toBe(first);
  });

  it('list delegates to findAll with the list params', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: taskId, title: 'Task' }])),
    );

    const result = await service.list({ status: 'todo', view: 'all' });

    expect(http.get).toHaveBeenCalledWith('', {
      params: { status: 'todo', view: 'all' },
      signal: undefined,
    });
    expect(result[0]).toBeInstanceOf(Task);
  });

  it('getByIdentifier GETs the identifier route', async () => {
    mockTaskResponse('get');

    const result = await service.getByIdentifier('GEN-42');

    expect(http.get).toHaveBeenCalledWith('/by-identifier/GEN-42');
    expect(result).toBeInstanceOf(Task);
    expect(result.id).toBe(taskId);
  });

  it('getChildren GETs the children collection', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'child_1', title: 'Child' }])),
    );

    const result = await service.getChildren(taskId);

    expect(http.get).toHaveBeenCalledWith(`/${taskId}/children`);
    expect(result[0].id).toBe('child_1');
  });

  it('createTask POSTs the input', async () => {
    mockTaskResponse('post', 'task_new');

    const result = await service.createTask({ title: 'New task' });

    expect(http.post).toHaveBeenCalledWith('', { title: 'New task' });
    expect(result.id).toBe('task_new');
  });

  it('updateTask PATCHes the input', async () => {
    mockTaskResponse('patch');

    await service.updateTask(taskId, { priority: 'high' });

    expect(http.patch).toHaveBeenCalledWith(`/${taskId}`, {
      priority: 'high',
    });
  });

  it('getInbox lists the inbox view with a limit', async () => {
    http.get.mockResolvedValue(axiosResponse(collectionDocument([])));

    await service.getInbox(7);

    expect(http.get).toHaveBeenCalledWith('', {
      params: { limit: 7, view: 'inbox' },
      signal: undefined,
    });
  });

  describe('review actions', () => {
    it('approve PATCHes reviewState approved', async () => {
      mockTaskResponse('patch');

      await service.approve(taskId);

      expect(http.patch).toHaveBeenCalledWith(`/${taskId}`, {
        reviewState: 'approved',
      });
    });

    it('requestChanges PATCHes the reason', async () => {
      mockTaskResponse('patch');

      await service.requestChanges(taskId, 'tighten the hook');

      expect(http.patch).toHaveBeenCalledWith(`/${taskId}`, {
        reason: 'tighten the hook',
        reviewState: 'changes_requested',
      });
    });

    it('dismiss PATCHes reviewState dismissed', async () => {
      mockTaskResponse('patch');

      await service.dismiss(taskId, 'duplicate');

      expect(http.patch).toHaveBeenCalledWith(`/${taskId}`, {
        reason: 'duplicate',
        reviewState: 'dismissed',
      });
    });
  });

  it('ensurePlanningThread POSTs to the plan-thread route', async () => {
    const payload = { created: true, seeded: false, threadId: 'thread_1' };
    http.post.mockResolvedValue(axiosResponse(payload));

    const result = await service.ensurePlanningThread(taskId);

    expect(http.post).toHaveBeenCalledWith(`/${taskId}/plan-thread`);
    expect(result).toEqual(payload);
  });

  it('createChildTasks POSTs and maps the children', async () => {
    http.post.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'child_2', title: 'Child' }])),
    );

    const result = await service.createChildTasks(taskId);

    expect(http.post).toHaveBeenCalledWith(`/${taskId}/children`);
    expect(result[0]).toBeInstanceOf(Task);
  });

  describe('output curation', () => {
    it('keepOutput PATCHes isKept true', async () => {
      mockTaskResponse('patch');

      await service.keepOutput(taskId, 'out_1');

      expect(http.patch).toHaveBeenCalledWith(`/${taskId}/outputs/out_1`, {
        isKept: true,
      });
    });

    it('unkeepOutput PATCHes isKept false', async () => {
      mockTaskResponse('patch');

      await service.unkeepOutput(taskId, 'out_1');

      expect(http.patch).toHaveBeenCalledWith(`/${taskId}/outputs/out_1`, {
        isKept: false,
      });
    });

    it('trashOutput DELETEs the output', async () => {
      mockTaskResponse('delete');

      await service.trashOutput(taskId, 'out_1');

      expect(http.delete).toHaveBeenCalledWith(`/${taskId}/outputs/out_1`);
    });
  });

  it('wraps failures in a structured error', async () => {
    http.get.mockRejectedValue({
      response: { data: { message: 'not found' }, status: 404 },
    });

    await expect(service.getByIdentifier('GEN-404')).rejects.toMatchObject({
      status: 404,
    });
  });
});
