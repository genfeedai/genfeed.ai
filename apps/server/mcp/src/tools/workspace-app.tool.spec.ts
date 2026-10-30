import type { ClientService } from '@mcp/services/client.service';
import {
  handleWorkspaceAppTool,
  WORKSPACE_APP_TOOL_NAMES,
} from '@mcp/tools/workspace-app.tool';

function buildClient() {
  return {
    createTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
    getTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
    listActivity: vi.fn().mockResolvedValue([{ id: 'activity-1' }]),
    listInbox: vi.fn().mockResolvedValue([]),
    listTasks: vi.fn().mockResolvedValue([{ id: 'task-1' }]),
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
  it('names exactly the five Workspace tools', () => {
    expect([...WORKSPACE_APP_TOOL_NAMES].sort()).toEqual([
      'create_task',
      'get_task',
      'list_activity',
      'list_inbox',
      'list_tasks',
    ]);
  });

  it('lists tasks with filters and a clamped page size', async () => {
    const client = buildClient();
    const result = await call(client, 'list_tasks', {
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
      call(client, 'list_tasks', { status: 'sleeping' }),
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
    const empty = await call(client, 'list_inbox', {});
    expect(empty.content[0]?.text).toBe('Nothing is waiting for review.');

    client.listInbox.mockResolvedValueOnce([{ id: 'gate-1' }]);
    const waiting = await call(client, 'list_inbox', {});
    expect(waiting.content[0]?.text).toContain('1 waiting for review');
    expect(waiting.content[0]?.text).toContain('/workspace/inbox');
  });

  it('lists activity and only filters to active work when asked', async () => {
    const client = buildClient();
    await call(client, 'list_activity', { activeOnly: true, limit: 5 });

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
