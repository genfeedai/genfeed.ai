import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('@genfeedai/tools', () => ({
  getToolsForSurface: vi.fn(() => [
    { name: 'generate_video', requiredRole: undefined },
    { name: 'get_video_status', requiredRole: undefined },
    { name: 'list_videos', requiredRole: undefined },
    { name: 'list_images', requiredRole: undefined },
    { name: 'get_credits_balance', requiredRole: undefined },
    { name: 'get_trends', requiredRole: undefined },
    { name: 'create_post', requiredRole: undefined },
    { name: 'list_posts', requiredRole: undefined },
    { name: 'create_article', requiredRole: undefined },
    { name: 'create_workflow', requiredRole: undefined },
    { name: 'execute_workflow', requiredRole: undefined },
    { name: 'list_workflows', requiredRole: undefined },
    { name: 'get_workflow_status', requiredRole: undefined },
    { name: 'get_content_analytics', requiredRole: undefined },
    { name: 'get_ad_performance_insights', requiredRole: 'admin' },
  ]),
  toMcpTools: vi.fn((tools) => tools),
}));

vi.mock('@mcp/guards/mcp-auth.guard', () => ({
  McpAuthGuard: {
    checkToolRole: vi.fn(),
  },
}));

describe('ToolRegistryService', () => {
  let service: ToolRegistryService;
  let clientService: {
    createVideo: ReturnType<typeof vi.fn>;
    getVideoStatus: ReturnType<typeof vi.fn>;
    listVideos: ReturnType<typeof vi.fn>;
    getVideoAnalytics: ReturnType<typeof vi.fn>;
    listImages: ReturnType<typeof vi.fn>;
    getCredits: ReturnType<typeof vi.fn>;
    getTrendingTopics: ReturnType<typeof vi.fn>;
    publishContent: ReturnType<typeof vi.fn>;
    listPosts: ReturnType<typeof vi.fn>;
    createArticle: ReturnType<typeof vi.fn>;
    createWorkflow: ReturnType<typeof vi.fn>;
    executeWorkflow: ReturnType<typeof vi.fn>;
    listWorkflows: ReturnType<typeof vi.fn>;
    getWorkflowStatus: ReturnType<typeof vi.fn>;
    getOrganizationAnalytics: ReturnType<typeof vi.fn>;
    setBearerToken: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolRegistryService,
        {
          provide: ClientService,
          useValue: {
            createArticle: vi.fn().mockResolvedValue({
              id: 'art-1',
              status: 'draft',
              title: 'AI News',
              wordCount: 500,
            }),
            createVideo: vi.fn().mockResolvedValue({
              estimatedCompletion: '5m',
              id: 'vid-1',
              status: 'queued',
            }),
            createWorkflow: vi.fn().mockResolvedValue({
              description: '',
              id: 'wf-1',
              name: 'My Flow',
              status: 'active',
              steps: [],
            }),
            executeWorkflow: vi.fn().mockResolvedValue({
              executionId: 'exec-1',
              startedAt: '2026-01-01',
              status: 'running',
              workflowId: 'wf-1',
            }),
            getCredits: vi.fn().mockResolvedValue({
              available: 500,
              breakdown: {
                articles: 20,
                avatars: 5,
                images: 15,
                music: 10,
                videos: 50,
              },
              total: 600,
              used: 100,
            }),
            getOrganizationAnalytics: vi
              .fn()
              .mockResolvedValue({ totalViews: 9999 }),
            getTrendingTopics: vi.fn().mockResolvedValue([{ topic: 'AI' }]),
            getVideoAnalytics: vi.fn().mockResolvedValue({ views: 1000 }),
            getVideoStatus: vi
              .fn()
              .mockResolvedValue({ progress: 100, status: 'completed' }),
            getWorkflowStatus: vi.fn().mockResolvedValue({
              currentStepIndex: 0,
              id: 'wf-1',
              name: 'My Flow',
              status: 'active',
              steps: [],
            }),
            listImages: vi.fn().mockResolvedValue([]),
            listPosts: vi.fn().mockResolvedValue([]),
            listVideos: vi
              .fn()
              .mockResolvedValue([{ id: 'vid-1', title: 'Test' }]),
            listWorkflows: vi
              .fn()
              .mockResolvedValue([
                { id: 'wf-1', name: 'My Flow', status: 'active' },
              ]),
            publishContent: vi.fn().mockResolvedValue([{ id: 'post-1' }]),
            setBearerToken: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ToolRegistryService);
    clientService = module.get(ClientService);
    logger = module.get(LoggerService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('getTools returns the MCP tool list', () => {
    const tools = service.getTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('getResources returns two analytics resources', () => {
    const resources = service.getResources();
    expect(resources).toHaveLength(2);
    expect(resources[0].uri).toBe('genfeed://analytics/videos');
    expect(resources[1].uri).toBe('genfeed://analytics/organization');
  });

  it('handleToolCall generate_video calls clientService.createVideo', async () => {
    const result = await service.handleToolCall({
      arguments: { description: 'AI surfing', title: 'Epic Reel' },
      name: 'generate_video',
    });

    expect(clientService.createVideo).toHaveBeenCalled();
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('vid-1');
  });

  it('handleToolCall get_video_status returns status info', async () => {
    const result = await service.handleToolCall({
      arguments: { videoId: 'vid-1' },
      name: 'get_video_status',
    });

    expect(clientService.getVideoStatus).toHaveBeenCalledWith('vid-1');
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('completed');
  });

  it('handleToolCall get_video_status throws when videoId missing', async () => {
    const result = await service.handleToolCall({
      arguments: {},
      name: 'get_video_status',
    });

    expect((result as { isError: boolean }).isError).toBe(true);
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('videoId required');
  });

  it('handleToolCall list_videos returns video list', async () => {
    const result = await service.handleToolCall({
      arguments: { limit: 5 },
      name: 'list_videos',
    });

    expect(clientService.listVideos).toHaveBeenCalledWith(5, 0);
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('vid-1');
  });

  it('handleToolCall get_credits_balance returns credits summary', async () => {
    const result = await service.handleToolCall({
      arguments: {},
      name: 'get_credits_balance',
    });

    expect(clientService.getCredits).toHaveBeenCalled();
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('500');
  });

  it('handleToolCall throws for unknown tool and returns error', async () => {
    const result = await service.handleToolCall({
      arguments: {},
      name: 'does_not_exist',
    });

    expect((result as { isError: boolean }).isError).toBe(true);
  });

  it('handleToolCall create_article requires topic', async () => {
    const result = await service.handleToolCall({
      arguments: {},
      name: 'create_article',
    });

    expect((result as { isError: boolean }).isError).toBe(true);
    expect(
      (result as { content: { text: string }[] }).content[0].text,
    ).toContain('topic required');
  });

  it('handleResourceRead returns video analytics for analytics URI', async () => {
    const result = await service.handleResourceRead({
      uri: 'genfeed://analytics/videos',
    });

    expect(clientService.getVideoAnalytics).toHaveBeenCalled();
    expect((result as { contents: { uri: string }[] }).contents[0].uri).toBe(
      'genfeed://analytics/videos',
    );
  });

  it('handleResourceRead returns org analytics', async () => {
    const result = await service.handleResourceRead({
      uri: 'genfeed://analytics/organization',
    });

    expect(clientService.getOrganizationAnalytics).toHaveBeenCalled();
  });

  it('handleResourceRead throws for unknown URI', async () => {
    await expect(
      service.handleResourceRead({ uri: 'genfeed://unknown' }),
    ).rejects.toThrow('Unknown resource');
  });

  it('setBearerToken delegates to clientService', () => {
    service.setBearerToken('new-token-123');
    expect(clientService.setBearerToken).toHaveBeenCalledWith('new-token-123');
  });

  it('logs error when tool handler throws', async () => {
    clientService.getCredits.mockRejectedValueOnce(new Error('Stripe down'));

    await service.handleToolCall({
      arguments: {},
      name: 'get_credits_balance',
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('get_credits_balance'),
      expect.any(Error),
    );
  });
});
