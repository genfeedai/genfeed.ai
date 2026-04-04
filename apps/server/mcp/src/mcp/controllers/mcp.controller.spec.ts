import { LoggerService } from '@libs/logger/logger.service';
import { McpController } from '@mcp/mcp/controllers/mcp.controller';
import { MCPService } from '@mcp/mcp/services/mcp.service';
import { ClientService } from '@mcp/services/client.service';
import { ServerService } from '@mcp/services/server.service';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('McpController', () => {
  let controller: McpController;

  const mockMcpService = {
    getHello: vi.fn().mockReturnValue('Genfeed MCP Server'),
    getMcpConfiguration: vi.fn().mockReturnValue({ version: '1.0.0' }),
    getMcpExample: vi.fn().mockReturnValue({ example: 'data' }),
  };

  const mockClientService = {
    createArticle: vi.fn(),
    createAvatar: vi.fn(),
    createImage: vi.fn(),
    createMusic: vi.fn(),
    createVideo: vi.fn(),
    createWorkflow: vi.fn(),
    executeWorkflow: vi.fn(),
    getArticle: vi.fn(),
    getCredits: vi.fn(),
    getOrganizationAnalytics: vi.fn(),
    getTrendingTopics: vi.fn(),
    getUsageStats: vi.fn(),
    getVideoAnalytics: vi.fn(),
    getVideoStatus: vi.fn(),
    getWorkflowStatus: vi.fn(),
    listAvatars: vi.fn(),
    listImages: vi.fn(),
    listMusic: vi.fn(),
    listPosts: vi.fn(),
    listVideos: vi.fn(),
    listWorkflows: vi.fn(),
    listWorkflowTemplates: vi.fn(),
    publishContent: vi.fn(),
    searchArticles: vi.fn(),
    setBearerToken: vi.fn(),
  };

  const mockServerService = {
    isServerRunning: vi.fn().mockReturnValue(true),
    setBearerToken: vi.fn(),
  };

  const mockStreamableHttpService = {
    getActiveSessionCount: vi.fn().mockReturnValue(0),
    handleDeleteRequest: vi.fn(),
    handleGetRequest: vi.fn(),
    handlePostRequest: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        { provide: MCPService, useValue: mockMcpService },
        { provide: ClientService, useValue: mockClientService },
        { provide: ServerService, useValue: mockServerService },
        { provide: StreamableHttpService, useValue: mockStreamableHttpService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    controller = module.get<McpController>(McpController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      const result = controller.getHealth();
      expect(result).toHaveProperty('status', 'healthy');
      expect(result).toHaveProperty('message', 'Genfeed MCP Server');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('serverRunning', true);
      expect(result).toHaveProperty('version', '1.0.0');
      expect(result).toHaveProperty('endpoints');
      expect(result).toHaveProperty('sessions', 0);
    });
  });

  describe('getMcpConfiguration', () => {
    it('should return MCP configuration', () => {
      const result = controller.getMcpConfiguration();
      expect(result).toHaveProperty('version', '1.0.0');
      expect(result).toHaveProperty('streamableHttp');
      expect(result.streamableHttp).toHaveProperty(
        'endpoint',
        'https://mcp.genfeed.ai/mcp',
      );
      expect(result.streamableHttp).toHaveProperty(
        'transport',
        'streamable-http',
      );
      expect(mockMcpService.getMcpConfiguration).toHaveBeenCalled();
    });
  });

  describe('getMcpExample', () => {
    it('should return MCP example', () => {
      const result = controller.getMcpExample();
      expect(result).toEqual({ example: 'data' });
      expect(mockMcpService.getMcpExample).toHaveBeenCalled();
    });
  });

  describe('getManifest', () => {
    it('should return manifest with server status', () => {
      const result = controller.getManifest();
      expect(result).toHaveProperty('server_running', true);
      expect(result).toHaveProperty('status', 'active');
      expect(result).toHaveProperty('mcp_version', '1.18.1');
      expect(result).toHaveProperty('server_version', '1.0.0');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('getTools', () => {
    it('should return list of available tools', () => {
      const result = controller.getTools();
      expect(result).toHaveProperty('tools');
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);

      // Check canonical video tool exists
      const createVideoTool = result.tools.find(
        (t: any) => t.name === 'generate_video',
      );
      expect(createVideoTool).toBeDefined();
      expect(createVideoTool?.inputSchema).toBeDefined();
    });
  });

  describe('getResources', () => {
    it('should return list of available resources', () => {
      const result = controller.getResources();
      expect(result).toHaveProperty('resources');
      expect(Array.isArray(result.resources)).toBe(true);
      expect(result.resources.length).toBe(2);

      const videoAnalytics = result.resources.find(
        (r: any) => r.uri === 'genfeed://analytics/videos',
      );
      expect(videoAnalytics).toBeDefined();
    });
  });

  describe('callTool', () => {
    const mockRequest = {
      authContext: {
        organizationId: 'org-123',
        token: 'test-token',
        userId: 'user-456',
      },
    } as any;

    it('should call generate_video tool', async () => {
      const args = {
        description: 'Test video description',
        title: 'Test Video',
      };

      mockClientService.createVideo.mockResolvedValue({
        estimatedCompletion: '2024-01-01T00:00:00Z',
        id: 'video-123',
        status: 'processing',
      });

      const result = await controller.callTool(
        'generate_video',
        args,
        mockRequest,
      );

      expect(mockClientService.setBearerToken).toHaveBeenCalledWith(
        'test-token',
      );
      expect(mockClientService.createVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Test video description',
          title: 'Test Video',
        }),
      );
      expect(result).toHaveProperty('tool', 'generate_video');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('timestamp');
    });

    it('should call get_video_status tool', async () => {
      const args = { videoId: 'video-123' };

      mockClientService.getVideoStatus.mockResolvedValue({
        message: 'Processing',
        progress: 50,
        status: 'processing',
      });

      const result = await controller.callTool(
        'get_video_status',
        args,
        mockRequest,
      );

      expect(mockClientService.getVideoStatus).toHaveBeenCalledWith(
        'video-123',
      );
      expect(result).toHaveProperty('tool', 'get_video_status');
    });

    it('should call list_videos tool', async () => {
      const args = { limit: 5, offset: 0 };

      mockClientService.listVideos.mockResolvedValue([
        { id: 'video-1', title: 'Video 1' },
        { id: 'video-2', title: 'Video 2' },
      ]);

      const result = await controller.callTool(
        'list_videos',
        args,
        mockRequest,
      );

      expect(mockClientService.listVideos).toHaveBeenCalledWith(5, 0);
      expect(result).toHaveProperty('tool', 'list_videos');
    });

    it('should throw error for unknown tool', async () => {
      await expect(
        controller.callTool('unknown_tool', {}, mockRequest),
      ).rejects.toThrow('Unknown tool: unknown_tool');
    });

    it('should throw error when required args missing', async () => {
      await expect(
        controller.callTool('generate_video', null, mockRequest),
      ).rejects.toThrow('Arguments required for generate_video');
    });
  });

  describe('readResource', () => {
    const mockRequest = {
      authContext: {
        organizationId: 'org-123',
        token: 'test-token',
        userId: 'user-456',
      },
    } as any;

    it('should read video analytics resource', async () => {
      mockClientService.getVideoAnalytics.mockResolvedValue({
        comments: 100,
        engagement: 75,
        likes: 500,
        shares: 50,
        views: 1000,
      });

      const result = await controller.readResource(
        'genfeed://analytics/videos',
        mockRequest,
      );

      expect(mockClientService.setBearerToken).toHaveBeenCalledWith(
        'test-token',
      );
      expect(mockClientService.getVideoAnalytics).toHaveBeenCalled();
      expect(result).toHaveProperty('resource', 'genfeed://analytics/videos');
      expect(result).toHaveProperty('result');
    });

    it('should read organization analytics resource', async () => {
      mockClientService.getOrganizationAnalytics.mockResolvedValue({
        activeUsers: 10,
        totalVideos: 50,
        totalViews: 10000,
      });

      const result = await controller.readResource(
        'genfeed://analytics/organization',
        mockRequest,
      );

      expect(mockClientService.getOrganizationAnalytics).toHaveBeenCalled();
      expect(result).toHaveProperty(
        'resource',
        'genfeed://analytics/organization',
      );
    });

    it('should throw error for unknown resource', async () => {
      await expect(
        controller.readResource('genfeed://unknown', mockRequest),
      ).rejects.toThrow('Unknown resource: genfeed://unknown');
    });
  });
});
