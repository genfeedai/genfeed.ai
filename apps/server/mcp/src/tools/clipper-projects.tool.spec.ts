import type { ClientService } from '@mcp/services/client.service';
import {
  CLIPPER_PROJECTS_TOOL_NAMES,
  handleClipperProjectsTool,
} from '@mcp/tools/clipper-projects.tool';

/**
 * Unit coverage for the clipper-projects MCP handler (#1245): argument mapping to
 * the ClientService proxy, required-field validation, and the avatar/raw-cut
 * mode branch. The client is mocked — API behavior is covered elsewhere.
 */
function buildClient() {
  return {
    analyzeClipperProject: vi.fn().mockResolvedValue({
      projectId: 'proj-1',
      status: 'analyzing',
    }),
    createClipperProjectFromYoutube: vi.fn().mockResolvedValue({
      batchJobId: 'batch-1',
      projectId: 'proj-1',
      status: 'processing',
    }),
    generateClips: vi.fn().mockResolvedValue({
      clipCount: 2,
      clipperResultIds: ['clip-1', 'clip-2'],
      status: 'generating',
    }),
    getClipperHighlights: vi.fn().mockResolvedValue({
      highlights: [],
      projectId: 'proj-1',
      status: 'analyzed',
    }),
    getClipperProject: vi.fn().mockResolvedValue({ id: 'proj-1' }),
    listClipperProjects: vi.fn().mockResolvedValue([{ id: 'proj-1' }]),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleClipperProjectsTool(
    client as unknown as ClientService,
    name,
    args,
  );
}

describe('CLIPPER_PROJECTS_TOOL_NAMES', () => {
  it('lists exactly the six clip tools', () => {
    expect([...CLIPPER_PROJECTS_TOOL_NAMES].sort()).toEqual([
      'analyze_clipper_project',
      'create_clipper_project_from_youtube',
      'get_clipper_highlights',
      'get_clipper_project',
      'list_clipper_projects',
      'run_clipper',
    ]);
  });
});

describe('handleClipperProjectsTool', () => {
  it('throws for an unknown tool name', () => {
    const client = buildClient();
    expect(() => call(client, 'not_a_clip_tool', {})).toThrow(
      /Unknown clip projects tool/,
    );
  });

  describe('analyze_clipper_project', () => {
    it('maps args and returns the analyze result', async () => {
      const client = buildClient();
      const result = await call(client, 'analyze_clipper_project', {
        maxClips: 5,
        youtubeUrl: 'https://youtu.be/abc',
      });

      expect(client.analyzeClipperProject).toHaveBeenCalledWith(
        expect.objectContaining({
          maxClips: 5,
          youtubeUrl: 'https://youtu.be/abc',
        }),
      );
      expect(result).toMatchObject({
        structuredContent: { data: { projectId: 'proj-1' } },
      });
      expect(result.content[0].text).not.toContain('proj-1');
    });

    it('requires youtubeUrl', async () => {
      const client = buildClient();
      await expect(call(client, 'analyze_clipper_project', {})).rejects.toThrow(
        /youtubeUrl is required/,
      );
      expect(client.analyzeClipperProject).not.toHaveBeenCalled();
    });
  });

  describe('create_clipper_project_from_youtube', () => {
    it('requires avatarId and voiceId for vendor-backed factories', async () => {
      const client = buildClient();
      await expect(
        call(client, 'create_clipper_project_from_youtube', {
          youtubeUrl: 'https://youtu.be/abc',
        }),
      ).rejects.toThrow(/avatarId and voiceId, or a brandId/);
      expect(client.createClipperProjectFromYoutube).not.toHaveBeenCalled();
    });

    it('allows managed GenfeedAI factories without vendor identity IDs', async () => {
      const client = buildClient();

      await call(client, 'create_clipper_project_from_youtube', {
        avatarProvider: 'genfeedai',
        brandId: 'brand-1',
        youtubeUrl: 'https://youtu.be/abc',
      });

      expect(client.createClipperProjectFromYoutube).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarId: undefined,
          avatarProvider: 'genfeedai',
          brandId: 'brand-1',
          voiceId: undefined,
        }),
      );
    });

    it('forwards the full factory payload', async () => {
      const client = buildClient();
      await call(client, 'create_clipper_project_from_youtube', {
        avatarId: 'av-1',
        voiceId: 'vo-1',
        youtubeUrl: 'https://youtu.be/abc',
      });

      expect(client.createClipperProjectFromYoutube).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarId: 'av-1',
          voiceId: 'vo-1',
          youtubeUrl: 'https://youtu.be/abc',
        }),
      );
    });
  });

  describe('get / list reads', () => {
    it('get_clipper_highlights requires projectId', async () => {
      const client = buildClient();
      await expect(call(client, 'get_clipper_highlights', {})).rejects.toThrow(
        /projectId is required/,
      );
    });

    it('get_clipper_project proxies by id', async () => {
      const client = buildClient();
      await call(client, 'get_clipper_project', { projectId: 'proj-1' });
      expect(client.getClipperProject).toHaveBeenCalledWith('proj-1');
    });

    it('list_clipper_projects reports an empty result', async () => {
      const client = buildClient();
      client.listClipperProjects.mockResolvedValue([]);
      const result = await call(client, 'list_clipper_projects', {});
      expect(result.content[0].text).toContain('No clip projects found');
    });
  });

  describe('run_clipper', () => {
    const baseArgs = {
      editedHighlights: [{ id: 'h1', summary: 'sum', title: 'title' }],
      projectId: 'proj-1',
      selectedHighlightIds: ['h1'],
    };

    it('requires avatarId and voiceId in avatar mode (the default)', async () => {
      const client = buildClient();
      await expect(call(client, 'run_clipper', baseArgs)).rejects.toThrow(
        /avatarId and voiceId are required for avatar mode/,
      );
      expect(client.generateClips).not.toHaveBeenCalled();
    });

    it('forwards avatar-mode generation with mode defaulted to avatar', async () => {
      const client = buildClient();
      await call(client, 'run_clipper', {
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
      await call(client, 'run_clipper', { ...baseArgs, mode: 'raw-cut' });

      expect(client.generateClips).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'raw-cut' }),
      );
    });

    it('rejects an invalid mode', async () => {
      const client = buildClient();
      await expect(
        call(client, 'run_clipper', { ...baseArgs, mode: 'bogus' }),
      ).rejects.toThrow(/mode must be "avatar" or "raw-cut"/);
    });

    it('rejects an empty editedHighlights array', async () => {
      const client = buildClient();
      await expect(
        call(client, 'run_clipper', {
          ...baseArgs,
          editedHighlights: [],
          mode: 'raw-cut',
        }),
      ).rejects.toThrow(/editedHighlights must be a non-empty array/);
    });

    it('rejects an editedHighlights entry missing a field', async () => {
      const client = buildClient();
      await expect(
        call(client, 'run_clipper', {
          ...baseArgs,
          editedHighlights: [{ id: 'h1', title: 'title' }],
          mode: 'raw-cut',
        }),
      ).rejects.toThrow(/summary is required/);
    });
  });
});
