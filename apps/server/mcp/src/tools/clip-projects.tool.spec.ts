import type { ClientService } from '@mcp/services/client.service';
import {
  CLIP_PROJECTS_TOOL_NAMES,
  handleClipProjectsTool,
} from '@mcp/tools/clip-projects.tool';

/**
 * Unit coverage for the clip-projects MCP handler (#1245): argument mapping to
 * the ClientService proxy, required-field validation, and the avatar/raw-cut
 * mode branch. The client is mocked — API behavior is covered elsewhere.
 */
function buildClient() {
  return {
    analyzeClipProject: vi.fn().mockResolvedValue({
      projectId: 'proj-1',
      status: 'analyzing',
    }),
    createClipProjectFromYoutube: vi.fn().mockResolvedValue({
      batchJobId: 'batch-1',
      projectId: 'proj-1',
      status: 'processing',
    }),
    generateClips: vi.fn().mockResolvedValue({
      clipCount: 2,
      clipResultIds: ['clip-1', 'clip-2'],
      status: 'generating',
    }),
    getClipHighlights: vi.fn().mockResolvedValue({
      highlights: [],
      projectId: 'proj-1',
      status: 'analyzed',
    }),
    getClipProject: vi.fn().mockResolvedValue({ id: 'proj-1' }),
    listClipProjects: vi.fn().mockResolvedValue([{ id: 'proj-1' }]),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleClipProjectsTool(client as unknown as ClientService, name, args);
}

describe('CLIP_PROJECTS_TOOL_NAMES', () => {
  it('lists exactly the six clip tools', () => {
    expect([...CLIP_PROJECTS_TOOL_NAMES].sort()).toEqual([
      'analyze_clip_project',
      'create_clip_project_from_youtube',
      'generate_clips',
      'get_clip_highlights',
      'get_clip_project',
      'list_clip_projects',
    ]);
  });
});

describe('handleClipProjectsTool', () => {
  it('throws for an unknown tool name', () => {
    const client = buildClient();
    expect(() => call(client, 'not_a_clip_tool', {})).toThrow(
      /Unknown clip projects tool/,
    );
  });

  describe('analyze_clip_project', () => {
    it('maps args and returns the analyze result', async () => {
      const client = buildClient();
      const result = await call(client, 'analyze_clip_project', {
        maxClips: 5,
        youtubeUrl: 'https://youtu.be/abc',
      });

      expect(client.analyzeClipProject).toHaveBeenCalledWith(
        expect.objectContaining({
          maxClips: 5,
          youtubeUrl: 'https://youtu.be/abc',
        }),
      );
      expect(result.content[0].text).toContain('proj-1');
    });

    it('requires youtubeUrl', async () => {
      const client = buildClient();
      await expect(call(client, 'analyze_clip_project', {})).rejects.toThrow(
        /youtubeUrl is required/,
      );
      expect(client.analyzeClipProject).not.toHaveBeenCalled();
    });
  });

  describe('create_clip_project_from_youtube', () => {
    it('requires avatarId and voiceId', async () => {
      const client = buildClient();
      await expect(
        call(client, 'create_clip_project_from_youtube', {
          youtubeUrl: 'https://youtu.be/abc',
        }),
      ).rejects.toThrow(/avatarId is required/);
      expect(client.createClipProjectFromYoutube).not.toHaveBeenCalled();
    });

    it('forwards the full factory payload', async () => {
      const client = buildClient();
      await call(client, 'create_clip_project_from_youtube', {
        avatarId: 'av-1',
        voiceId: 'vo-1',
        youtubeUrl: 'https://youtu.be/abc',
      });

      expect(client.createClipProjectFromYoutube).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarId: 'av-1',
          voiceId: 'vo-1',
          youtubeUrl: 'https://youtu.be/abc',
        }),
      );
    });
  });

  describe('get / list reads', () => {
    it('get_clip_highlights requires projectId', async () => {
      const client = buildClient();
      await expect(call(client, 'get_clip_highlights', {})).rejects.toThrow(
        /projectId is required/,
      );
    });

    it('get_clip_project proxies by id', async () => {
      const client = buildClient();
      await call(client, 'get_clip_project', { projectId: 'proj-1' });
      expect(client.getClipProject).toHaveBeenCalledWith('proj-1');
    });

    it('list_clip_projects reports an empty result', async () => {
      const client = buildClient();
      client.listClipProjects.mockResolvedValue([]);
      const result = await call(client, 'list_clip_projects', {});
      expect(result.content[0].text).toContain('No clip projects found');
    });
  });

  describe('generate_clips', () => {
    const baseArgs = {
      editedHighlights: [{ id: 'h1', summary: 'sum', title: 'title' }],
      projectId: 'proj-1',
      selectedHighlightIds: ['h1'],
    };

    it('requires avatarId and voiceId in avatar mode (the default)', async () => {
      const client = buildClient();
      await expect(call(client, 'generate_clips', baseArgs)).rejects.toThrow(
        /avatarId and voiceId are required for avatar mode/,
      );
      expect(client.generateClips).not.toHaveBeenCalled();
    });

    it('forwards avatar-mode generation with mode defaulted to avatar', async () => {
      const client = buildClient();
      await call(client, 'generate_clips', {
        ...baseArgs,
        avatarId: 'av-1',
        voiceId: 'vo-1',
      });

      expect(client.generateClips).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarId: 'av-1',
          editedHighlights: [{ id: 'h1', summary: 'sum', title: 'title' }],
          mode: 'avatar',
          projectId: 'proj-1',
          selectedHighlightIds: ['h1'],
          voiceId: 'vo-1',
        }),
      );
    });

    it('allows raw-cut mode without avatar/voice (forward-compat for #1238)', async () => {
      const client = buildClient();
      await call(client, 'generate_clips', { ...baseArgs, mode: 'raw-cut' });

      expect(client.generateClips).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'raw-cut' }),
      );
    });

    it('rejects an invalid mode', async () => {
      const client = buildClient();
      await expect(
        call(client, 'generate_clips', { ...baseArgs, mode: 'bogus' }),
      ).rejects.toThrow(/mode must be "avatar" or "raw-cut"/);
    });

    it('rejects an empty editedHighlights array', async () => {
      const client = buildClient();
      await expect(
        call(client, 'generate_clips', {
          ...baseArgs,
          editedHighlights: [],
          mode: 'raw-cut',
        }),
      ).rejects.toThrow(/editedHighlights must be a non-empty array/);
    });

    it('rejects an editedHighlights entry missing a field', async () => {
      const client = buildClient();
      await expect(
        call(client, 'generate_clips', {
          ...baseArgs,
          editedHighlights: [{ id: 'h1', title: 'title' }],
          mode: 'raw-cut',
        }),
      ).rejects.toThrow(/summary is required/);
    });
  });
});
