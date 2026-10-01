import type { ClientService } from '@mcp/services/client.service';
import { EDITOR_TOOL_NAMES, handleEditorTool } from '@mcp/tools/editor.tool';

function buildClient() {
  return {
    openInEditor: vi.fn().mockResolvedValue({
      id: 'editor-1',
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
  it('lists only the Open in Editor handoff', () => {
    expect([...EDITOR_TOOL_NAMES]).toEqual(['open_in_editor']);
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
    expect(result.content[0]?.text).toContain('"/studio/editor/editor-1"');
    expect(result.content[0]?.text).toContain('"id": "editor-1"');
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
});
