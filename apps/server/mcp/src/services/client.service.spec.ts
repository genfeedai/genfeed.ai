import { createHash } from 'node:crypto';
import { MCP_ACTION_ORIGIN_PROOF_HEADER, Platform } from '@genfeedai/contracts';
import {
  UNATTRIBUTED_FORWARDED_HEADER,
  UNATTRIBUTED_FORWARDED_VALUE,
} from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { ClientService } from '@mcp/services/client.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import axios, { type AxiosInstance } from 'axios';
import type { Mock } from 'vitest';

describe('ClientService (MCP)', () => {
  let service: ClientService;
  let loggerService: LoggerService;

  const mockAxiosInstance: Partial<AxiosInstance> = {
    defaults: axios.create({ headers: { Authorization: '' } }).defaults,
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  };

  const mockHttpService = {
    axiosRef: {
      create: vi.fn().mockReturnValue(mockAxiosInstance),
    },
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, string> = {
        GENFEEDAI_API_KEY: 'test-api-key',
        GENFEEDAI_API_URL: 'https://api.genfeed.ai',
      };
      return config[key];
    }),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<ClientService>(ClientService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with API configuration (base normalized to /v1)', () => {
    expect(mockHttpService.axiosRef.create).toHaveBeenCalledWith({
      baseURL: 'https://api.genfeed.ai/v1',
      headers: {
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
        [UNATTRIBUTED_FORWARDED_HEADER]: UNATTRIBUTED_FORWARDED_VALUE,
        [MCP_ACTION_ORIGIN_PROOF_HEADER]: createHash('sha256')
          .update('test-api-key')
          .digest('base64url'),
      },
      timeout: 30000,
    });
  });

  describe('setBearerToken', () => {
    it('should update the bearer token without replacing the service proof', () => {
      const newToken = 'new-test-token';
      service.setBearerToken(newToken);
      expect(mockAxiosInstance.defaults?.headers.Authorization).toBe(
        `Bearer ${newToken}`,
      );
      expect(
        mockAxiosInstance.defaults?.headers[MCP_ACTION_ORIGIN_PROOF_HEADER],
      ).toBe(createHash('sha256').update('test-api-key').digest('base64url'));
    });

    it('should retain the service proof when clearing the caller token', () => {
      const headers = mockAxiosInstance.defaults?.headers;
      if (!headers) {
        throw new Error('Expected Axios default headers');
      }
      headers[MCP_ACTION_ORIGIN_PROOF_HEADER] = 'stale-proof';

      service.setBearerToken('');

      expect(mockAxiosInstance.defaults?.headers.Authorization).toBeUndefined();
      expect(
        mockAxiosInstance.defaults?.headers[MCP_ACTION_ORIGIN_PROOF_HEADER],
      ).toBe(createHash('sha256').update('test-api-key').digest('base64url'));
    });
  });

  // ==================== VIDEO TESTS ====================

  describe('createVideo', () => {
    it('should create video with valid parameters', async () => {
      const params = {
        description: 'Test video description',
        duration: 30,
        title: 'Test Video',
      };

      const mockResponse = {
        data: {
          data: {
            attributes: { status: 'processing' },
            id: 'video-123',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.createVideo(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/videos',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'videos' }),
        }),
      );
      expect(result.id).toBe('video-123');
      expect(result.status).toBe('processing');
    });

    it('should handle video creation error', async () => {
      const params = { description: 'Test', title: 'Test' };
      (mockAxiosInstance.post as Mock).mockRejectedValue({
        message: 'API Error',
        response: { data: { errors: [{ detail: 'Failed to create video' }] } },
      });

      await expect(service.createVideo(params)).rejects.toThrow(
        'Failed to create video',
      );
    });
  });

  // ==================== ARTICLE TESTS ====================

  describe('searchArticles', () => {
    it('should search articles by query', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              attributes: { label: 'Article 1', summary: 'Preview...' },
              id: 'a1',
            },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.searchArticles({ limit: 10, query: 'AI' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/articles', {
        params: expect.objectContaining({ 'filter[search]': 'AI' }),
      });
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Article 1');
      expect(result[0].excerpt).toBe('Preview...');
    });
  });

  describe('getArticle', () => {
    // The article serializer emits `label`, not `title` — see
    // `articleAttributes` in @genfeedai/serializers.
    it('should return article by ID', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { content: 'Full content', label: 'Article Title' },
            id: 'article-123',
          },
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.getArticle('article-123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/articles/article-123',
      );
      expect(result.title).toBe('Article Title');
      expect(result.wordCount).toBe(2);
    });
  });

  // ==================== SCHEDULER TESTS ====================

  describe('scheduled releases', () => {
    const releaseResponse = {
      data: {
        data: {
          attributes: { status: 'scheduled', title: 'Launch' },
          id: 'release-1',
          type: 'release-group',
        },
      },
    };

    it('creates a release with an idempotency header', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue(releaseResponse);
      const release = {
        baseContent: 'Hello',
        targets: [{ credentialId: 'credential-1', platform: 'linkedin' }],
        timezone: 'Europe/Malta',
        title: 'Launch',
      };

      await service.createScheduledRelease(release, 'request-1');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/post-groups',
        release,
        { headers: { 'idempotency-key': 'request-1' } },
      );
    });

    it('gets a release using an encoded ID', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue(releaseResponse);

      await service.getScheduledRelease('release/1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/post-groups/release%2F1',
      );
    });

    it('updates release and target routes explicitly', async () => {
      (mockAxiosInstance.patch as Mock).mockResolvedValue(releaseResponse);

      await service.updateScheduledRelease('release-1', { title: 'Updated' });
      await service.updateScheduledRelease(
        'release-1',
        { scheduledDate: '2026-07-20T10:00:00+02:00' },
        'target-1',
      );

      expect(mockAxiosInstance.patch).toHaveBeenNthCalledWith(
        1,
        '/post-groups/release-1',
        { title: 'Updated' },
      );
      expect(mockAxiosInstance.patch).toHaveBeenNthCalledWith(
        2,
        '/post-groups/release-1/targets/target-1',
        { scheduledDate: '2026-07-20T10:00:00+02:00' },
      );
    });

    it('patches lifecycle control actions onto the release route', async () => {
      (mockAxiosInstance.patch as Mock).mockResolvedValue(releaseResponse);

      await service.controlScheduledRelease('release-1', 'pause');

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/post-groups/release-1',
        { action: 'pause' },
      );
    });

    it('lists scheduler capabilities through the existing REST route', async () => {
      const capabilities = [
        { label: 'YouTube', platform: 'youtube', status: 'supported' },
      ];
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: capabilities,
      });

      const result = await service.listSchedulerCapabilities({
        includeHidden: true,
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/schedules/channel-capabilities',
        { params: { includeHidden: true } },
      );
      expect(mockAxiosInstance.post).not.toHaveBeenCalled();
      expect(mockAxiosInstance.patch).not.toHaveBeenCalled();
      expect(result).toEqual(capabilities);
    });

    it('lists brand publishing readiness through the canonical credentials route', async () => {
      const readiness = [
        {
          canSchedule: true,
          credentialId: 'credential-1',
          diagnostics: [],
          providerKey: 'youtube',
          state: 'publish_capable',
        },
      ];
      (mockAxiosInstance.get as Mock).mockResolvedValue({ data: readiness });

      const result = await service.listBrandPublishingReadiness('brand/1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/credentials/brand/brand%2F1/publishing-readiness',
      );
      expect(mockAxiosInstance.post).not.toHaveBeenCalled();
      expect(mockAxiosInstance.patch).not.toHaveBeenCalled();
      expect(result).toEqual(readiness);
    });

    it('gets one scheduler capability using an encoded platform', async () => {
      const capability = {
        label: 'TikTok',
        platform: 'tiktok',
        status: 'supported',
      };
      (mockAxiosInstance.get as Mock).mockResolvedValue({ data: capability });

      const result = await service.getSchedulerCapability('tiktok/live');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/schedules/channel-capabilities/tiktok%2Flive',
      );
      expect(mockAxiosInstance.post).not.toHaveBeenCalled();
      expect(mockAxiosInstance.patch).not.toHaveBeenCalled();
      expect(result).toEqual(capability);
    });

    it('validates a proposed target without mutating scheduler state', async () => {
      const input = {
        platform: 'youtube',
        settings: { privacyStatus: 'public' },
      };
      const validation = {
        errors: [],
        platform: 'youtube',
        valid: true,
        validationState: 'valid',
        warnings: [],
      };
      (mockAxiosInstance.post as Mock).mockResolvedValue({ data: validation });

      const result = await service.validateSchedulerTarget(input);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/schedules/channel-capabilities/validate',
        input,
      );
      expect(mockAxiosInstance.patch).not.toHaveBeenCalled();
      expect(mockAxiosInstance.put).not.toHaveBeenCalled();
      expect(mockAxiosInstance.delete).not.toHaveBeenCalled();
      expect(result).toEqual(validation);
    });
  });

  // ==================== IMAGE TESTS ====================

  describe('createImage', () => {
    it('should create image with valid parameters', async () => {
      const params = {
        prompt: 'A sunset over mountains',
        quality: 'hd' as const,
        size: 'landscape' as const,
        style: 'photographic' as const,
      };

      const mockResponse = {
        data: {
          data: {
            attributes: { status: 'processing', url: '' },
            id: 'image-123',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.createImage(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/images',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'images' }),
        }),
      );
      expect(result.id).toBe('image-123');
    });
  });

  // ==================== AVATAR TESTS ====================

  // ==================== MUSIC TESTS ====================

  describe('createMusic', () => {
    it('should create music with valid parameters', async () => {
      const params = {
        duration: 60,
        genre: 'cinematic' as const,
        mood: 'inspirational' as const,
        prompt: 'Epic orchestral piece',
      };

      const mockResponse = {
        data: {
          data: {
            attributes: { status: 'processing' },
            id: 'music-123',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.createMusic(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/musics',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'musics' }),
        }),
      );
      expect(result.id).toBe('music-123');
    });
  });

  // ==================== PUBLISHING TESTS ====================

  describe('publishContent', () => {
    it('should publish content to multiple platforms', async () => {
      const params = {
        contentId: 'content-123',
        customMessage: 'Check this out!',
        platforms: [Platform.TWITTER, Platform.LINKEDIN],
      };

      const mockResponse = {
        data: {
          data: [
            {
              attributes: { platform: 'twitter', status: 'pending' },
              id: 'post-1',
            },
            {
              attributes: { platform: 'linkedin', status: 'pending' },
              id: 'post-2',
            },
          ],
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.publishContent(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/posts',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'posts' }),
        }),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('listPosts', () => {
    it('should return list of posts', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              attributes: { platform: 'twitter', status: 'published' },
              id: 'p1',
            },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listPosts({ limit: 10 });

      expect(result).toHaveLength(1);
    });

    it('should filter posts by platform', async () => {
      const mockResponse = { data: { data: [] } };
      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      await service.listPosts({ limit: 10, platform: 'twitter' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/posts', {
        params: expect.objectContaining({ 'filter[platform]': 'twitter' }),
      });
    });
  });

  // ==================== ANALYTICS TESTS ====================

  describe('getTrendingTopics', () => {
    it('should return trending topics', async () => {
      const mockResponse = {
        data: {
          data: [
            { attributes: { growth: 25, topic: 'AI', volume: 10000 } },
            { attributes: { growth: 15, topic: 'Tech', volume: 8000 } },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.getTrendingTopics({
        category: 'tech',
        timeframe: '24h',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/trends', {
        params: { category: 'tech', timeframe: '24h' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].topic).toBe('AI');
    });
  });

  describe('getCredits', () => {
    it('should return credits usage', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: {
              available: 500,
              breakdown: { articles: 10, images: 20, videos: 5 },
              total: 1000,
              used: 500,
            },
          },
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.getCredits();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/credits/usage');
      expect(result.available).toBe(500);
      expect(result.breakdown.videos).toBe(5);
    });
  });

  // ==================== WORKFLOW TESTS ====================

  describe('createWorkflow', () => {
    it('should create workflow from template', async () => {
      const params = {
        description: 'Daily content workflow',
        name: 'Daily Content',
        templateId: 'daily-image-generation',
      };

      const mockResponse = {
        data: {
          data: {
            attributes: {
              name: 'Daily Content',
              status: 'draft',
              steps: [],
            },
            id: 'workflow-123',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.createWorkflow(params);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/workflows',
        expect.objectContaining({
          data: expect.objectContaining({ type: 'workflows' }),
        }),
      );
      expect(result.id).toBe('workflow-123');
      expect(result.status).toBe('draft');
    });
  });

  describe('getWorkflowStatus', () => {
    it('should return workflow status', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: {
              name: 'My Workflow',
              // The API serializes the node list; the client derives the count.
              nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
              status: 'active',
            },
            id: 'workflow-123',
          },
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.getWorkflowStatus('workflow-123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/workflows/workflow-123',
      );
      expect(result.status).toBe('active');
      expect(result.nodeCount).toBe(3);
    });

    it('uses lastExecutedAt when the payload has no lastRunAt', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: {
          data: {
            attributes: {
              lastExecutedAt: '2026-09-23T07:00:00.000Z',
              name: 'Daily Trends Digest',
              status: 'active',
            },
            id: 'workflow-123',
          },
        },
      });

      const result = await service.getWorkflowStatus('workflow-123');

      expect(result.lastRunAt).toBe('2026-09-23T07:00:00.000Z');
    });
  });

  describe('listWorkflows', () => {
    it('should return list of workflows', async () => {
      const mockResponse = {
        data: {
          data: [
            { attributes: { name: 'Workflow 1', status: 'active' }, id: 'w1' },
            { attributes: { name: 'Workflow 2', status: 'draft' }, id: 'w2' },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listWorkflows({ limit: 10 });

      expect(result).toHaveLength(2);
    });

    it('should filter workflows by status', async () => {
      const mockResponse = { data: { data: [] } };
      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      await service.listWorkflows({ limit: 10, status: 'active' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/workflows', {
        params: expect.objectContaining({ 'filter[status]': 'active' }),
      });
    });
  });

  describe('inspectWorkflow', () => {
    it('should inspect a workflow with schedule and graph summary fields', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: {
              edges: [{ id: 'edge-1' }],
              inputVariables: [{ key: 'topic', required: true }],
              isScheduleEnabled: true,
              label: 'System workflow',
              lifecycle: 'published',
              metadata: { systemWorkflow: true },
              nodes: [{ id: 'node-1' }, { id: 'node-2' }],
              schedule: '0 9 * * *',
              status: 'draft',
              timezone: 'UTC',
            },
            id: 'workflow-123',
          },
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.inspectWorkflow('workflow-123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/workflows/workflow-123',
      );
      expect(result).toMatchObject({
        edgeCount: 1,
        id: 'workflow-123',
        isScheduleEnabled: true,
        name: 'System workflow',
        nodeCount: 2,
        schedule: '0 9 * * *',
      });
    });
  });

  describe('duplicateWorkflow', () => {
    it('should duplicate a workflow via POST /workflows sourceWorkflowId', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { label: 'System workflow (Copy)', status: 'draft' },
            id: 'workflow-copy',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.duplicateWorkflow('workflow-123');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/workflows', {
        sourceWorkflowId: 'workflow-123',
      });
      expect(result.id).toBe('workflow-copy');
      expect(result.name).toBe('System workflow (Copy)');
    });
  });

  describe('setWorkflowSchedule', () => {
    it('should enable or update a workflow schedule', async () => {
      (mockAxiosInstance.patch as Mock).mockResolvedValue({
        data: {
          data: {
            attributes: {
              isScheduleEnabled: true,
              name: 'Scheduled workflow',
              schedule: '0 9 * * *',
              status: 'active',
              timezone: 'UTC',
            },
            id: 'workflow-123',
          },
        },
      });

      const result = await service.setWorkflowSchedule('workflow-123', {
        enabled: true,
        schedule: '0 9 * * *',
        timezone: 'UTC',
      });

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/workflows/workflow-123',
        {
          isScheduleEnabled: true,
          schedule: '0 9 * * *',
          timezone: 'UTC',
        },
      );
      expect(result).toMatchObject({
        enabled: true,
        id: 'workflow-123',
        schedule: '0 9 * * *',
      });
    });

    it('should disable a workflow schedule through the collapsed patch endpoint when no new schedule is provided', async () => {
      (mockAxiosInstance.patch as Mock).mockResolvedValue({
        data: {
          data: {
            attributes: {
              isScheduleEnabled: false,
              name: 'Scheduled workflow',
              status: 'active',
            },
            id: 'workflow-123',
          },
        },
      });

      const result = await service.setWorkflowSchedule('workflow-123', {
        enabled: false,
      });

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/workflows/workflow-123',
        {
          isScheduleEnabled: false,
          schedule: null,
        },
      );
      expect(result).toMatchObject({ enabled: false, id: 'workflow-123' });
    });
  });

  describe('listWorkflowRuns', () => {
    it('should list workflow execution history with filters', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              attributes: {
                progress: 100,
                status: 'completed',
                trigger: 'manual',
                workflowId: 'workflow-123',
              },
              id: 'run-1',
            },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listWorkflowRuns({
        limit: 5,
        status: 'completed',
        workflowId: 'workflow-123',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/workflow-executions',
        {
          params: {
            limit: 5,
            offset: 0,
            status: 'completed',
            workflowId: 'workflow-123',
          },
        },
      );
      expect(result).toEqual([
        {
          completedAt: undefined,
          createdAt: undefined,
          durationMs: undefined,
          error: undefined,
          id: 'run-1',
          metadata: {},
          nodeResults: [],
          progress: 100,
          startedAt: undefined,
          status: 'completed',
          trigger: 'manual',
          updatedAt: undefined,
          workflowId: 'workflow-123',
        },
      ]);
    });
  });

  describe('getWorkflowRun', () => {
    it('should inspect one workflow execution', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: {
              progress: 50,
              status: 'running',
              workflowId: 'workflow-123',
            },
            id: 'run-1',
          },
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.getWorkflowRun('run-1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/workflow-executions/run-1',
      );
      expect(result).toMatchObject({
        id: 'run-1',
        progress: 50,
        status: 'running',
      });
    });
  });

  describe('listWorkflowTemplates', () => {
    it('should return list of workflow templates', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              attributes: {
                category: 'content',
                description: 'Generate daily images',
                name: 'Daily Image Generation',
              },
              id: 'daily-image-generation',
            },
            {
              attributes: {
                category: 'social',
                description: 'Publish to social media',
                name: 'Social Media Publish',
              },
              id: 'social-media-publish',
            },
          ],
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listWorkflowTemplates();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/workflows/templates',
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('daily-image-generation');
      expect(result[0].name).toBe('Daily Image Generation');
    });

    it('reads plain catalog objects that are not JSON:API resources', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: {
          data: [
            {
              category: 'content',
              description: 'Send the morning digest',
              id: 'daily-trends',
              name: 'Daily Trends Digest',
            },
          ],
        },
      });

      const result = await service.listWorkflowTemplates();

      expect(result[0]).toMatchObject({
        description: 'Send the morning digest',
        id: 'daily-trends',
        name: 'Daily Trends Digest',
      });
    });
  });

  // ==================== SOCIAL MESSAGES TESTS ====================

  describe('listSocialConversations', () => {
    it('should list conversations with review filters', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              attributes: {
                latestMessageText: 'Can I get the template?',
                platform: 'youtube',
                status: 'open',
              },
              id: 'conv-1',
            },
          ],
          meta: { page: 1, totalPages: 1 },
        },
      };

      (mockAxiosInstance.get as Mock).mockResolvedValue(mockResponse);

      const result = await service.listSocialConversations({
        limit: 5,
        needsReview: true,
        platform: 'youtube',
        status: 'open',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/messages', {
        params: {
          limit: 5,
          needsReview: true,
          platform: 'youtube',
          status: 'open',
        },
      });
      expect(result).toEqual({
        conversations: [
          {
            id: 'conv-1',
            latestMessageText: 'Can I get the template?',
            platform: 'youtube',
            status: 'open',
          },
        ],
        meta: { page: 1, totalPages: 1 },
      });
    });
  });

  describe('getSocialConversation', () => {
    it('should inspect a conversation and include bounded recent messages', async () => {
      (mockAxiosInstance.get as Mock)
        .mockResolvedValueOnce({
          data: {
            data: {
              attributes: { platform: 'instagram', status: 'needs_review' },
              id: 'conv-1',
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            data: [
              {
                attributes: { body: 'Interested', status: 'received' },
                id: 'msg-1',
              },
            ],
          },
        });

      const result = await service.getSocialConversation('conv-1', {
        limit: 10,
      });

      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(
        1,
        '/messages/conv-1',
      );
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(
        2,
        '/messages/conv-1/messages',
        { params: { limit: 10 } },
      );
      expect(result).toEqual({
        conversation: {
          id: 'conv-1',
          platform: 'instagram',
          status: 'needs_review',
        },
        messages: [{ body: 'Interested', id: 'msg-1', status: 'received' }],
      });
    });
  });

  describe('social message actions', () => {
    it('should create a provenance-backed reply draft without publishing', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: {
              actionProvenance: { actorType: 'workflow' },
              body: 'Thanks for asking',
              status: 'draft',
            },
            id: 'msg-draft',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.createSocialReplyDraft('conv-1', {
        text: 'Thanks for asking',
        workflowRunId: 'workflow-run-1',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/messages/conv-1/drafts',
        {
          text: 'Thanks for asking',
          workflowRunId: 'workflow-run-1',
        },
      );
      expect(result).toEqual({
        actionProvenance: { actorType: 'workflow' },
        body: 'Thanks for asking',
        id: 'msg-draft',
        status: 'draft',
      });
    });

    it('should post replies through the social inbox action route', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { body: 'Public reply', status: 'sent' },
            id: 'msg-reply',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.postSocialReply('conv-1', {
        idempotencyKey: 'reply-1',
        text: 'Public reply',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/messages/conv-1/replies',
        { idempotencyKey: 'reply-1', text: 'Public reply' },
      );
      expect(result).toMatchObject({ id: 'msg-reply', status: 'sent' });
    });

    it('should send DMs through the social inbox action route', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { body: 'Private follow-up', status: 'sent' },
            id: 'msg-dm',
          },
        },
      };

      (mockAxiosInstance.post as Mock).mockResolvedValue(mockResponse);

      const result = await service.sendSocialDm('conv-1', {
        recipientId: 'viewer-1',
        text: 'Private follow-up',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/messages/conv-1/dms',
        { recipientId: 'viewer-1', text: 'Private follow-up' },
      );
      expect(result).toMatchObject({ id: 'msg-dm', status: 'sent' });
    });

    it('should update social conversation metadata through patch routes', async () => {
      const mockResponse = {
        data: {
          data: {
            attributes: { assignedOwnerId: 'user-2', tags: ['lead'] },
            id: 'conv-1',
          },
        },
      };

      (mockAxiosInstance.patch as Mock).mockResolvedValue(mockResponse);

      const result = await service.updateSocialTags('conv-1', ['lead']);

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/messages/conv-1', {
        tags: ['lead'],
      });
      expect(result).toMatchObject({ id: 'conv-1', tags: ['lead'] });
    });
  });

  // ==================== TIKTOK ADS TESTS ====================

  // TikTok has no per-platform controller — every call goes through the
  // platform-generic ads gateway at `/ads/:platform/*`, so these assert the
  // gateway path shape and the credential/account scoping it requires.
  describe('TikTok Ads', () => {
    it('lists advertiser accounts through the ads gateway', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ id: 'advertiser-1' }] },
      });

      const result = await service.listTikTokAdAccounts('credential-1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ads/tiktok/accounts',
        { params: { credentialId: 'credential-1' } },
      );
      expect(result).toEqual([{ id: 'advertiser-1' }]);
    });

    it('lists campaigns scoped to a credential and advertiser account', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ id: 'campaign-1' }] },
      });

      await service.listTikTokCampaigns('credential-1', 'advertiser-1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ads/tiktok/campaigns',
        {
          params: {
            adAccountId: 'advertiser-1',
            credentialId: 'credential-1',
          },
        },
      );
    });

    it('sends the campaign id in the path and the date range as params', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { ctr: 1.2 } },
      });

      await service.getTikTokCampaignInsights(
        'credential-1',
        'advertiser-1',
        'campaign-1',
        'last_7d',
        '2026-08-01',
        '2026-08-06',
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ads/tiktok/campaigns/campaign-1/insights',
        {
          params: {
            adAccountId: 'advertiser-1',
            credentialId: 'credential-1',
            datePreset: 'last_7d',
            since: '2026-08-01',
            until: '2026-08-06',
          },
        },
      );
    });

    it('passes ranking options to top performers', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ metric: 'ctr', value: 3.1 }] },
      });

      await service.getTikTokTopPerformers(
        'credential-1',
        'advertiser-1',
        'ctr',
        5,
        'last_30d',
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ads/tiktok/top-performers',
        {
          params: {
            adAccountId: 'advertiser-1',
            credentialId: 'credential-1',
            datePreset: 'last_30d',
            limit: 5,
            metric: 'ctr',
          },
        },
      );
    });

    it('lists ad groups via the gateway adsets route', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ id: 'adgroup-1' }] },
      });

      await service.listTikTokAdGroups(
        'credential-1',
        'advertiser-1',
        'campaign-1',
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ads/tiktok/adsets', {
        params: {
          adAccountId: 'advertiser-1',
          campaignId: 'campaign-1',
          credentialId: 'credential-1',
        },
      });
    });

    it('maps the ad group filter onto the gateway adSetId param', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ id: 'ad-1' }] },
      });

      await service.listTikTokAds('credential-1', 'advertiser-1', 'adgroup-1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/ads/tiktok/ads', {
        params: {
          adAccountId: 'advertiser-1',
          adSetId: 'adgroup-1',
          credentialId: 'credential-1',
        },
      });
    });
  });

  // ==================== ERROR HANDLING TESTS ====================

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      (mockAxiosInstance.get as Mock).mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.getCredits()).rejects.toThrow(
        'Failed to get credits usage',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should extract error detail from API response', async () => {
      (mockAxiosInstance.post as Mock).mockRejectedValue({
        message: 'API Error',
        response: {
          data: { errors: [{ detail: 'Specific error message' }] },
        },
      });

      await expect(
        service.createVideo({ description: 'Test', title: 'Test' }),
      ).rejects.toThrow('Specific error message');
    });
  });
});
