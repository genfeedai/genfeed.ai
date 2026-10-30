import type { ClientService } from '@mcp/services/client.service';
import { EDITOR_TOOL_NAMES, handleEditorTool } from '@mcp/tools/editor.tool';

function buildClient() {
  return {
    getEditorProject: vi.fn().mockResolvedValue({
      attributes: { name: 'Launch cut', status: 'draft' },
      id: 'editor-1',
      type: 'editor-project',
    }),
    listEditorProjects: vi
      .fn()
      .mockResolvedValue([
        { attributes: { name: 'Launch cut' }, id: 'editor-1' },
      ]),
    openInEditor: vi.fn().mockResolvedValue({
      id: 'editor-1',
      type: 'editor-project',
    }),
    startEditorRender: vi.fn().mockResolvedValue({
      attributes: { status: 'rendering' },
      id: 'job-1',
      type: 'editor-project',
    }),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleEditorTool(client as unknown as ClientService, name, args);
}

describe('EDITOR_TOOL_NAMES', () => {
  it('lists the handoff, the two project reads and the render', () => {
    expect([...EDITOR_TOOL_NAMES].sort()).toEqual([
      'get_editor_project',
      'list_editor_projects',
      'open_in_editor',
      'start_editor_render',
    ]);
  });
});

describe('handleEditorTool', () => {
  it('throws for an unknown tool name', async () => {
    const client = buildClient();
    await expect(call(client, 'not_an_editor_tool', {})).rejects.toThrow(
      /Unknown Editor tool/,
    );
    expect(client.openInEditor).not.toHaveBeenCalled();
  });

  it('seeds videos in order and returns the Editor path', async () => {
    const client = buildClient();
    const result = await call(client, 'open_in_editor', {
      name: '  Launch cut  ',
      sourceVideoIds: [' video-2 ', 'video-1'],
    });

    expect(client.openInEditor).toHaveBeenCalledWith({
      name: 'Launch cut',
      sourceVideoIds: ['video-2', 'video-1'],
    });
    expect(result.content[0]?.text).toContain('[Open in Editor](');
    expect(result.structuredContent.data).toMatchObject({
      id: 'editor-1',
      editorPath: '/editor/editor-1',
    });
    expect(result.content[0]?.text).not.toContain('ID:');
  });

  it('omits a blank name so the API keeps Untitled Project', async () => {
    const client = buildClient();
    await call(client, 'open_in_editor', {
      name: '   ',
      sourceVideoIds: ['video-1'],
    });

    expect(client.openInEditor).toHaveBeenCalledWith({
      sourceVideoIds: ['video-1'],
    });
  });

  it('rejects an empty seed list before calling the API', async () => {
    const client = buildClient();
    await expect(
      call(client, 'open_in_editor', { sourceVideoIds: [] }),
    ).rejects.toThrow(/sourceVideoIds must be a non-empty array/);
    expect(client.openInEditor).not.toHaveBeenCalled();
  });

  it('rejects a blank id and a name past the Editor limit', async () => {
    const client = buildClient();
    await expect(
      call(client, 'open_in_editor', { sourceVideoIds: ['  '] }),
    ).rejects.toThrow(/sourceVideoIds\[0\]/);
    await expect(
      call(client, 'open_in_editor', {
        name: 'x'.repeat(121),
        sourceVideoIds: ['video-1'],
      }),
    ).rejects.toThrow(/name must be at most 120/);
    expect(client.openInEditor).not.toHaveBeenCalled();
  });

  it('rejects more than 50 source videos', async () => {
    const client = buildClient();
    await expect(
      call(client, 'open_in_editor', {
        sourceVideoIds: Array.from({ length: 51 }, (_, index) => `v-${index}`),
      }),
    ).rejects.toThrow(/at most 50/);
    expect(client.openInEditor).not.toHaveBeenCalled();
  });

  it('fails when the create response has no id', async () => {
    const client = buildClient();
    client.openInEditor.mockResolvedValueOnce({});
    await expect(
      call(client, 'open_in_editor', { sourceVideoIds: ['video-1'] }),
    ).rejects.toThrow(/did not return an id/);
  });

  it('lists Editor projects with a clamped page size', async () => {
    const client = buildClient();
    const result = await call(client, 'list_editor_projects', {
      limit: 500,
      page: 0,
    });

    expect(client.listEditorProjects).toHaveBeenCalledWith({
      limit: 100,
      page: 1,
    });
    expect(result.content[0]?.text).toContain('Found 1 Editor projects');
    expect(result.content[0]?.text).toContain('Launch cut');
  });

  it('says so when there are no Editor projects', async () => {
    const client = buildClient();
    client.listEditorProjects.mockResolvedValueOnce([]);
    const result = await call(client, 'list_editor_projects', {});

    expect(result.content[0]?.text).toBe('No Editor projects found.');
  });

  it('reads one project and links its Editor path', async () => {
    const client = buildClient();
    const result = await call(client, 'get_editor_project', {
      projectId: ' editor-1 ',
    });

    expect(client.getEditorProject).toHaveBeenCalledWith('editor-1');
    expect(result.structuredContent.data).toMatchObject({
      editorPath: '/editor/editor-1',
    });
    expect(result.content[0]?.text).toContain('[Open in Editor](');
  });

  it('requires a projectId to read a project', async () => {
    const client = buildClient();
    await expect(call(client, 'get_editor_project', {})).rejects.toThrow(
      /projectId is required/,
    );
    expect(client.getEditorProject).not.toHaveBeenCalled();
  });

  it('queues a render and returns the job with the Editor path', async () => {
    const client = buildClient();
    const result = await call(client, 'start_editor_render', {
      projectId: ' editor-1 ',
    });

    expect(client.startEditorRender).toHaveBeenCalledWith('editor-1');
    expect(result.structuredContent.data).toMatchObject({
      editorPath: '/editor/editor-1',
      job: { attributes: { status: 'rendering' }, id: 'job-1' },
      projectId: 'editor-1',
    });
    expect(result.content[0]?.text).toContain('Render queued');
    expect(result.content[0]?.text).toContain('get_editor_project');
  });

  it('requires a projectId to start a render', async () => {
    const client = buildClient();
    await expect(call(client, 'start_editor_render', {})).rejects.toThrow(
      /projectId is required/,
    );
    expect(client.startEditorRender).not.toHaveBeenCalled();
  });
});
