import type { ClientService } from '@mcp/services/client.service';
import {
  handleWorkspaceAppTool,
  WORKSPACE_APP_TOOL_NAMES,
} from '@mcp/tools/workspace-app.tool';

function buildClient() {
  return {
    commentOnTask: vi.fn().mockResolvedValue({ id: 'comment-1' }),
    createTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
    getTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
    getReviewRun: vi.fn().mockResolvedValue(undefined),
    listActivity: vi.fn().mockResolvedValue([{ id: 'activity-1' }]),
    listInbox: vi.fn().mockResolvedValue([]),
    listTasks: vi.fn().mockResolvedValue([{ id: 'task-1' }]),
    updateTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleWorkspaceAppTool(client as unknown as ClientService, name, args);
}

describe('handleWorkspaceAppTool', () => {
  it('routes the Workspace tools', () => {
    expect([...WORKSPACE_APP_TOOL_NAMES].sort()).toEqual([
      'create_task',
      'get_activity',
      'get_inbox',
      'get_review_queue',
      'get_task',
      'get_tasks',
      'manage_task',
    ]);
  });

  it('returns the completed task from the task API', async () => {
    const client = buildClient();
    client.updateTask.mockResolvedValueOnce({ id: 'task-1', status: 'done' });

    const result = await call(client, 'manage_task', {
      action: 'complete',
      input: { taskId: 'task-1' },
    });

    expect(result.structuredContent).toEqual({
      data: { id: 'task-1', status: 'done' },
    });
    expect(client.updateTask).toHaveBeenCalledWith('task-1', {
      status: 'done',
    });
  });

  it('uses an opaque user ID for reassignment and returns the updated task', async () => {
    const client = buildClient();
    client.updateTask.mockResolvedValueOnce({
      assigneeUserId: 'authUser',
      id: 'task-1',
    });

    const result = await call(client, 'manage_task', {
      action: 'update',
      input: { assigneeUserId: 'authUser', taskId: 'task-1' },
    });

    expect(result.structuredContent).toEqual({
      data: { assigneeUserId: 'authUser', id: 'task-1' },
    });
    expect(client.updateTask).toHaveBeenCalledWith('task-1', {
      assigneeUserId: 'authUser',
    });
  });

  it('returns the posted comment', async () => {
    const client = buildClient();
    const result = await call(client, 'manage_task', {
      action: 'comment',
      input: { body: 'Ready for the next step.', taskId: 'task-1' },
    });

    expect(result.structuredContent).toEqual({ data: { id: 'comment-1' } });
    expect(client.commentOnTask).toHaveBeenCalledWith(
      'task-1',
      'Ready for the next step.',
    );
  });

  it.each([
    { action: 'update', input: { taskId: 'task-1' } },
    { action: 'update', input: { reviewState: 'approved', taskId: 'task-1' } },
    { action: 'update', input: { organizationId: 'other', taskId: 'task-1' } },
    { action: 'update', input: { brandId: 'other', taskId: 'task-1' } },
    { action: 'comment', input: { body: ' ', taskId: 'task-1' } },
    {
      action: 'complete',
      input: { reviewState: 'approved', taskId: 'task-1' },
    },
    { action: 'approve', input: { taskId: 'task-1' } },
  ])('rejects an unsupported task operation %#', async (args) => {
    const client = buildClient();
    await expect(call(client, 'manage_task', args)).rejects.toThrow();
    expect(client.updateTask).not.toHaveBeenCalled();
    expect(client.commentOnTask).not.toHaveBeenCalled();
  });

  it('lists tasks with filters and a clamped page size', async () => {
    const client = buildClient();
    const result = await call(client, 'get_tasks', {
      limit: 1000,
      priority: 'high',
      status: 'todo',
    });

    expect(client.listTasks).toHaveBeenCalledWith({
      limit: 100,
      page: undefined,
      priority: 'high',
      status: 'todo',
    });
    expect(result.content[0]?.text).toContain('Found 1 tasks');
  });

  it('rejects a status the API does not know', async () => {
    const client = buildClient();
    await expect(
      call(client, 'get_tasks', { status: 'sleeping' }),
    ).rejects.toThrow(/status must be one of: backlog, todo/);
    expect(client.listTasks).not.toHaveBeenCalled();
  });

  it('reads a task by id and requires the id', async () => {
    const client = buildClient();
    const result = await call(client, 'get_task', { taskId: ' task-1 ' });

    expect(client.getTask).toHaveBeenCalledWith('task-1');
    expect(result.structuredContent.data).toEqual({ id: 'task-1' });
    await expect(call(client, 'get_task', {})).rejects.toThrow(
      /taskId is required/,
    );
  });

  it('creates a task from a trimmed title and drops blank optional fields', async () => {
    const client = buildClient();
    await call(client, 'create_task', {
      description: '   ',
      priority: 'low',
      title: '  Plan launch week  ',
    });

    expect(client.createTask).toHaveBeenCalledWith({
      description: undefined,
      priority: 'low',
      status: undefined,
      title: 'Plan launch week',
    });
    await expect(call(client, 'create_task', {})).rejects.toThrow(
      /title is required/,
    );
  });

  it('says the inbox is clear and links the app when items wait', async () => {
    const client = buildClient();
    const empty = await call(client, 'get_inbox', {});
    expect(empty.content[0]?.text).toBe('Nothing is waiting for review.');

    client.listInbox.mockResolvedValueOnce([{ id: 'gate-1' }]);
    const waiting = await call(client, 'get_inbox', {});
    expect(waiting.content[0]?.text).toContain('1 waiting for review');
    expect(waiting.content[0]?.text).toContain('/workspace/inbox');
  });

  it('returns ready Turbo items and pending approvals for the selected brand', async () => {
    const client = buildClient();
    const ready = { id: 'ready', status: TurboRunItemStatus.COMPLETED };
    client.getReviewRun.mockResolvedValue({
      id: 'batch-1',
      attributes: {
        items: [ready, { id: 'pending', status: TurboRunItemStatus.PENDING }],
      },
    });
    const approval = { id: 'approval-1' };
    client.listInbox.mockResolvedValue([approval]);

    const result = await call(client, 'get_review_queue', {
      brandId: 'brand-1',
    });

    expect(result.structuredContent.data).toEqual({
      turboRunId: 'batch-1',
      turboItems: [ready],
      reviewItems: [approval],
    });
    expect(result.content[0]?.text).toContain('/publishing/approvals');
  });

  it('filters the selected batch by the requested Turbo item status', async () => {
    const client = buildClient();
    const failed = { id: 'failed', status: TurboRunItemStatus.FAILED };
    client.getReviewRun.mockResolvedValue({
      id: 'batch-1',
      attributes: {
        items: [failed, { id: 'ready', status: TurboRunItemStatus.COMPLETED }],
      },
    });

    const result = await call(client, 'get_review_queue', {
      brandId: 'brand-1',
      status: 'failed',
      turboRunId: 'batch-1',
    });

    expect(result.structuredContent.data).toEqual({
      turboRunId: 'batch-1',
      turboItems: [failed],
      reviewItems: [],
    });
    expect(client.getReviewRun).toHaveBeenCalledWith('brand-1', 'batch-1');
  });

  it('lists activity and only filters to active work when asked', async () => {
    const client = buildClient();
    await call(client, 'get_activity', { activeOnly: true, limit: 5 });

    expect(client.listActivity).toHaveBeenCalledWith({
      activeOnly: true,
      limit: 5,
      page: undefined,
    });
  });

  it('throws for an unknown Workspace tool', async () => {
    const client = buildClient();
    await expect(call(client, 'nope', {})).rejects.toThrow(
      /Unknown Workspace tool/,
    );
  });
});

import { TurboRunItemStatus } from '@genfeedai/contracts';
