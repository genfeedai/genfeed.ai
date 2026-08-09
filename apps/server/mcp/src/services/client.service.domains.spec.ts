import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { ClientService } from '@mcp/services/client.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';

/**
 * Domain-client coverage for the ClientService composition root: agent
 * approvals, analytics, clips, workspace, system workflow catalog, social
 * inbox actions, Meta/Google ads, the platform-generic ads gateway, and
 * LinkedIn. Complements `client.service.spec.ts`, which covers media,
 * content, scheduler, workflows, TikTok, and error plumbing.
 */
describe('ClientService (MCP) domain clients', () => {
  let service: ClientService;

  const mockAxiosInstance = {
    defaults: {
      headers: {} as Record<string, string>,
    },
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== GENERIC ATTRIBUTE POST ====================

  describe('postAttributes', () => {
    it('posts the payload and unwraps created attributes', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { attributes: { label: 'Created' }, id: 'res-1' } },
      });

      const result = await service.postAttributes<{ label: string }>(
        '/things',
        { label: 'Created' },
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/things', {
        label: 'Created',
      });
      expect(result).toEqual({ label: 'Created' });
    });

    it('falls back to the resource when attributes are absent', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { id: 'res-1' } },
      });

      const result = await service.postAttributes<{ id: string }>(
        '/things',
        {},
      );

      expect(result).toEqual({ id: 'res-1' });
    });
  });

  // ==================== AGENT TOOLS & APPROVALS ====================

  describe('executeAgentTool', () => {
    it('proxies the tool execution with an encoded tool name', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { output: 'ok', success: true },
      });

      const result = await service.executeAgentTool(
        'generate video',
        { prompt: 'sunset' },
        { organizationId: 'org-1' },
      );

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/agent-tools/generate%20video/execute',
        {
          context: { organizationId: 'org-1' },
          parameters: { prompt: 'sunset' },
        },
      );
      expect(result).toEqual({ output: 'ok', success: true });
    });

    it('surfaces the API error detail when execution fails', async () => {
      (mockAxiosInstance.post as Mock).mockRejectedValue({
        message: 'Bad request',
        response: { data: { errors: [{ detail: 'Tool disabled' }] } },
      });

      await expect(service.executeAgentTool('my_tool', {})).rejects.toThrow(
        'Tool disabled',
      );
    });
  });

  describe('approvals lifecycle', () => {
    it('creates a pending approval for a mutating tool call', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { id: 'approval-1', status: 'PENDING' } },
      });

      const result = await service.createApproval('publish_content', {
        contentId: 'content-1',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/mcp-approvals', {
        arguments: { contentId: 'content-1' },
        toolName: 'publish_content',
      });
      expect(result).toEqual({ id: 'approval-1', status: 'PENDING' });
    });

    it('fetches an approval by encoded id', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { id: 'approval/1', status: 'PENDING' } },
      });

      const result = await service.getApproval('approval/1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/mcp-approvals/approval%2F1',
      );
      expect(result).toEqual({ id: 'approval/1', status: 'PENDING' });
    });

    it('returns null when the approval payload is empty', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({ data: {} });

      const result = await service.getApproval('approval-404');

      expect(result).toBeNull();
    });

    it('resolves an approval and forwards an optional result', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { id: 'approval-1', status: 'APPROVED' } },
      });

      const result = await service.resolveApproval('approval-1', 'approve', {
        note: 'looks good',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/mcp-approvals/approval-1/resolve',
        { decision: 'approve', result: { note: 'looks good' } },
      );
      expect(result).toEqual({ id: 'approval-1', status: 'APPROVED' });
    });

    it('resolves an approval without a result payload', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { id: 'approval-1', status: 'DECLINED' } },
      });

      await service.resolveApproval('approval-1', 'decline');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/mcp-approvals/approval-1/resolve',
        { decision: 'decline' },
      );
    });

    it('attaches the execution result to a claimed approval', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { id: 'approval-1', status: 'APPROVED' } },
      });

      await service.attachApprovalResult('approval-1', { output: 'done' });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/mcp-approvals/approval-1/result',
        { result: { output: 'done' } },
      );
    });
  });

  // ==================== ANALYTICS ====================

  describe('getVideoAnalytics', () => {
    it('reads per-content aggregate metrics for a video id', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: {
          data: {
            attributes: {
              averageWatchTime: 12,
              comments: 3,
              engagement: 8,
              likes: 20,
              shares: 4,
              views: 100,
            },
          },
        },
      });

      const result = await service.getVideoAnalytics('video-1', '30d');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/content-performance/aggregate/video-1',
        { params: { timeRange: '30d' } },
      );
      expect(result).toEqual({
        averageWatchTime: 12,
        comments: 3,
        engagement: 8,
        likes: 20,
        shares: 4,
        timeRange: '30d',
        videoId: 'video-1',
        views: 100,
      });
    });

    it('falls back to the org-wide listing when no video id is given', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: {} },
      });

      const result = await service.getVideoAnalytics();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/content-performance',
        { params: { timeRange: '7d' } },
      );
      expect(result.videoId).toBe('all');
      expect(result.views).toBe(0);
    });

    it('degrades to zeroed analytics instead of throwing', async () => {
      (mockAxiosInstance.get as Mock).mockRejectedValue(
        new Error('Network down'),
      );

      const result = await service.getVideoAnalytics('video-1');

      expect(result).toEqual({
        averageWatchTime: 0,
        comments: 0,
        engagement: 0,
        likes: 0,
        shares: 0,
        timeRange: '7d',
        videoId: 'video-1',
        views: 0,
      });
      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  describe('getOrganizationAnalytics', () => {
    it('maps org analytics attributes onto the rollup shape', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: {
          data: {
            attributes: {
              activeUsers: 5,
              averageVideoLength: 42,
              growthRate: 1.5,
              topPerformingVideos: [{ id: 'v1' }],
              totalEngagement: 900,
              totalVideos: 12,
              totalViews: 4000,
            },
          },
        },
      });

      const result = await service.getOrganizationAnalytics();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/analytics/organizations',
      );
      expect(result.activeUsers).toBe(5);
      expect(result.topPerformingVideos).toEqual([{ id: 'v1' }]);
    });

    it('degrades to an empty org rollup on failure', async () => {
      (mockAxiosInstance.get as Mock).mockRejectedValue(new Error('boom'));

      const result = await service.getOrganizationAnalytics();

      expect(result).toEqual({
        activeUsers: 0,
        averageVideoLength: 0,
        growthRate: 0,
        topPerformingVideos: [],
        totalEngagement: 0,
        totalVideos: 0,
        totalViews: 0,
      });
    });
  });

  // ==================== CLIP PROJECTS ====================

  describe('clip projects', () => {
    it('analyzes a clip project from a YouTube URL', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { id: 'project-1', status: 'analyzing' } },
      });

      const result = await service.analyzeClipProject({
        language: 'en',
        maxClips: 5,
        minViralityScore: 70,
        name: 'Launch keynote',
        youtubeUrl: 'https://youtube.com/watch?v=abc',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/clip-projects/analyze',
        {
          language: 'en',
          maxClips: 5,
          minViralityScore: 70,
          name: 'Launch keynote',
          youtubeUrl: 'https://youtube.com/watch?v=abc',
        },
      );
      expect(result).toEqual({ id: 'project-1', status: 'analyzing' });
    });

    it('creates a full clip project from YouTube with avatar and voice', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { id: 'project-2' } },
      });

      await service.createClipProjectFromYoutube({
        avatarId: 'avatar-1',
        avatarProvider: 'heygen',
        voiceId: 'voice-1',
        youtubeUrl: 'https://youtube.com/watch?v=abc',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/clip-projects/from-youtube',
        expect.objectContaining({
          avatarId: 'avatar-1',
          avatarProvider: 'heygen',
          voiceId: 'voice-1',
          youtubeUrl: 'https://youtube.com/watch?v=abc',
        }),
      );
    });

    it('reads highlights for a project', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { highlights: [{ id: 'h1' }] } },
      });

      const result = await service.getClipHighlights('project-1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/clip-projects/project-1/highlights',
      );
      expect(result).toEqual({ highlights: [{ id: 'h1' }] });
    });

    it('reads a single clip project', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { id: 'project-1', status: 'ready' } },
      });

      const result = await service.getClipProject('project-1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/clip-projects/project-1',
      );
      expect(result).toEqual({ id: 'project-1', status: 'ready' });
    });

    it('generates clips from selected highlights', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { queued: true } },
      });

      await service.generateClips({
        avatarId: 'avatar-1',
        editedHighlights: [
          { id: 'h1', summary: 'Intro summary', title: 'Intro' },
        ],
        mode: 'avatar',
        projectId: 'project-1',
        selectedHighlightIds: ['h1'],
        voiceId: 'voice-1',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/clip-projects/project-1/generate',
        {
          avatarId: 'avatar-1',
          avatarProvider: undefined,
          editedHighlights: [
            { id: 'h1', summary: 'Intro summary', title: 'Intro' },
          ],
          mode: 'avatar',
          selectedHighlightIds: ['h1'],
          voiceId: 'voice-1',
        },
      );
    });

    it('propagates the API error detail when generation fails', async () => {
      (mockAxiosInstance.post as Mock).mockRejectedValue({
        message: 'Bad request',
        response: { data: { errors: [{ detail: 'Highlights not found' }] } },
      });

      await expect(
        service.generateClips({
          editedHighlights: [],
          projectId: 'project-1',
          selectedHighlightIds: ['h1'],
        }),
      ).rejects.toThrow('Highlights not found');
    });

    it('lists clip projects with default pagination', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ id: 'project-1' }] },
      });

      const result = await service.listClipProjects();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/clip-projects', {
        params: { 'page[limit]': 10, 'page[offset]': 0 },
      });
      expect(result).toEqual([{ id: 'project-1' }]);
    });
  });

  // ==================== WORKSPACE ====================

  describe('workspace reads', () => {
    it('lists brands with id/name normalization', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: {
          data: [
            { attributes: { name: 'Acme', status: 'active' }, id: 'brand-1' },
            { attributes: {}, id: 'brand-2' },
          ],
        },
      });

      const result = await service.listBrands();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/brands');
      expect(result[0]).toMatchObject({
        id: 'brand-1',
        name: 'Acme',
        status: 'active',
      });
      expect(result[1]).toMatchObject({ id: 'brand-2', name: 'Unnamed' });
    });

    it('returns an empty brand list when the payload has no data', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({ data: {} });

      const result = await service.listBrands();

      expect(result).toEqual([]);
    });

    it('lists personas with JSON:API filters and paging defaults', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: {
          data: [{ attributes: { name: 'Persona A' }, id: 'persona-1' }],
        },
      });

      const result = await service.listPersonas({ status: 'READY' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/personas', {
        params: {
          'filter[status]': 'READY',
          'page[limit]': 10,
          'page[offset]': 0,
        },
      });
      expect(result).toEqual([{ id: 'persona-1', name: 'Persona A' }]);
    });

    it('creates a content batch as a JSON:API resource', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: {
          data: { attributes: { batchId: 'batch-1', status: 'PENDING' } },
        },
      });

      const result = await service.createBatch({
        count: 3,
        prompt: 'Daily post ideas',
        type: 'images',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/batches', {
        data: {
          attributes: {
            count: 3,
            prompt: 'Daily post ideas',
            type: 'images',
          },
          type: 'batches',
        },
      });
      expect(result).toEqual({ batchId: 'batch-1', status: 'PENDING' });
    });

    it('surfaces API error detail when batch creation fails', async () => {
      (mockAxiosInstance.post as Mock).mockRejectedValue({
        message: 'Bad request',
        response: { data: { errors: [{ detail: 'Insufficient credits' }] } },
      });

      await expect(
        service.createBatch({ count: 1, prompt: 'x', type: 'images' }),
      ).rejects.toThrow('Insufficient credits');
    });

    it('lists batches and flattens attributes onto each row', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: {
          data: [{ attributes: { status: 'PROCESSING' }, id: 'batch-1' }],
        },
      });

      const result = await service.listBatches({
        batchId: 'batch-1',
        limit: 5,
        status: 'PROCESSING',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/batches', {
        params: {
          'filter[batchId]': 'batch-1',
          'filter[status]': 'PROCESSING',
          'page[limit]': 5,
          'page[offset]': 0,
        },
      });
      expect(result).toEqual([{ id: 'batch-1', status: 'PROCESSING' }]);
    });

    it('returns an empty batch list for a non-array payload', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: null },
      });

      const result = await service.listBatches();

      expect(result).toEqual([]);
    });

    it('reads account identity from the whoami endpoint', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: {
          data: { organization: 'org-1', user: { email: 'user@genfeed.ai' } },
        },
      });

      const result = await service.getAccountInfo();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/auth/whoami');
      expect(result).toEqual({
        organization: 'org-1',
        user: { email: 'user@genfeed.ai' },
      });
    });

    it('reads job status from ingredient metadata', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: {
          data: { attributes: { status: 'PROCESSING' }, id: 'ingredient-1' },
        },
      });

      const result = await service.getJobStatus('ingredient-1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ingredients/ingredient-1/metadata',
      );
      expect(result).toEqual({ id: 'ingredient-1', status: 'PROCESSING' });
    });

    it('creates an agent chat thread', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { id: 'thread-1' } },
      });

      const result = await service.createChat();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/agent/threads');
      expect(result).toEqual({ id: 'thread-1' });
    });

    it('sends a chat message to an existing thread', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: { data: { id: 'turn-1' } },
      });

      const result = await service.sendChatMessage('thread-1', 'Hello');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/agent/threads/thread-1/messages',
        { content: 'Hello' },
      );
      expect(result).toEqual({ id: 'turn-1' });
    });
  });

  // ==================== SYSTEM WORKFLOW CATALOG ====================

  describe('system workflow catalog', () => {
    const catalogPayload = {
      data: {
        data: [
          {
            canonicalId: 'daily-posts',
            family: 'product',
            installable: true,
            installed: true,
            installedWorkflowId: 'workflow-1',
            label: 'Daily posts',
          },
          {
            canonicalId: 'internal-maintenance',
            family: 'platform',
            installable: false,
            installed: false,
            label: 'Maintenance',
          },
        ],
      },
    };

    it('lists installable catalog entries by default', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue(catalogPayload);

      const result = await service.listSystemWorkflowCatalog();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/workflows', {
        params: { source: 'system-catalog' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        canonicalId: 'daily-posts',
        installable: true,
        installed: true,
      });
    });

    it('includes non-installable entries and filters by family', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue(catalogPayload);

      const result = await service.listSystemWorkflowCatalog({
        family: 'platform',
        includeNonInstallable: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].canonicalId).toBe('internal-maintenance');
    });

    it('filters to already-installed entries', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue(catalogPayload);

      const result = await service.listSystemWorkflowCatalog({
        installedOnly: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].installedWorkflowId).toBe('workflow-1');
    });

    it('installs a catalog entry as an org-owned workflow', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: {
          data: {
            attributes: { name: 'Daily posts', status: 'draft' },
            id: 'workflow-2',
          },
        },
      });

      const result = await service.installSystemWorkflow({
        brandId: 'brand-1',
        canonicalId: 'daily-posts',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/workflows', {
        brandId: 'brand-1',
        sourceType: 'system-catalog',
        templateId: 'daily-posts',
      });
      expect(result).toMatchObject({ id: 'workflow-2', name: 'Daily posts' });
    });
  });

  // ==================== SOCIAL INBOX ACTIONS ====================

  describe('social inbox actions', () => {
    it('lists messages inside a conversation', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: {
          data: [{ attributes: { body: 'Hi there' }, id: 'msg-1' }],
        },
      });

      const result = await service.listSocialMessages('conv-1', { limit: 20 });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/messages/conv-1/messages',
        { params: { limit: 20 } },
      );
      expect(result).toEqual([{ body: 'Hi there', id: 'msg-1' }]);
    });

    it('skips the message fetch when includeMessages is false', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { attributes: { status: 'open' }, id: 'conv-1' } },
      });

      const result = await service.getSocialConversation('conv-1', {
        includeMessages: false,
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        conversation: { id: 'conv-1', status: 'open' },
      });
    });

    it('approves a draft through the draft patch route', async () => {
      (mockAxiosInstance.patch as Mock).mockResolvedValue({
        data: { data: { attributes: { status: 'approved' }, id: 'msg-1' } },
      });

      const result = await service.approveSocialDraft('conv-1', 'msg-1');

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/messages/conv-1/drafts/msg-1',
        { status: 'approved' },
      );
      expect(result).toMatchObject({ id: 'msg-1', status: 'approved' });
    });

    it('rejects a draft with an optional reason', async () => {
      (mockAxiosInstance.patch as Mock).mockResolvedValue({
        data: { data: { attributes: { status: 'rejected' }, id: 'msg-1' } },
      });

      await service.rejectSocialDraft('conv-1', 'msg-1', 'Off brand');

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/messages/conv-1/drafts/msg-1',
        { reason: 'Off brand', status: 'rejected' },
      );
    });

    it('rejects a draft without a reason', async () => {
      (mockAxiosInstance.patch as Mock).mockResolvedValue({
        data: { data: { attributes: { status: 'rejected' }, id: 'msg-1' } },
      });

      await service.rejectSocialDraft('conv-1', 'msg-1');

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/messages/conv-1/drafts/msg-1',
        { status: 'rejected' },
      );
    });

    it('assigns a conversation owner and supports unassignment', async () => {
      (mockAxiosInstance.patch as Mock).mockResolvedValue({
        data: { data: { id: 'conv-1' } },
      });

      await service.assignSocialConversation('conv-1', 'user-1');
      await service.assignSocialConversation('conv-1', null);

      expect(mockAxiosInstance.patch).toHaveBeenNthCalledWith(
        1,
        '/messages/conv-1',
        { assignedOwnerId: 'user-1' },
      );
      expect(mockAxiosInstance.patch).toHaveBeenNthCalledWith(
        2,
        '/messages/conv-1',
        { assignedOwnerId: null },
      );
    });

    it('marks a conversation resolved', async () => {
      (mockAxiosInstance.patch as Mock).mockResolvedValue({
        data: { data: { attributes: { status: 'resolved' }, id: 'conv-1' } },
      });

      const result = await service.markSocialConversationResolved('conv-1');

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith('/messages/conv-1', {
        status: 'resolved',
      });
      expect(result).toMatchObject({ id: 'conv-1', status: 'resolved' });
    });
  });

  // ==================== META ADS ====================

  describe('Meta Ads', () => {
    it('lists ad accounts', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ id: 'act_1' }] },
      });

      const result = await service.listMetaAdAccounts();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/meta-ads/accounts',
      );
      expect(result).toEqual([{ id: 'act_1' }]);
    });

    it('lists campaigns with status and limit filters', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ id: 'campaign-1' }] },
      });

      await service.listMetaCampaigns('act_1', 'ACTIVE', 25);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/meta-ads/campaigns',
        { params: { adAccountId: 'act_1', limit: 25, status: 'ACTIVE' } },
      );
    });

    it('gets campaign insights with a date preset and range', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { ctr: 2.1 } },
      });

      const result = await service.getMetaCampaignInsights(
        'campaign-1',
        'last_7d',
        '2026-08-01',
        '2026-08-06',
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/meta-ads/campaigns/campaign-1/insights',
        {
          params: {
            datePreset: 'last_7d',
            since: '2026-08-01',
            until: '2026-08-06',
          },
        },
      );
      expect(result).toEqual({ ctr: 2.1 });
    });

    it('gets ad set insights', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { cpc: 0.4 } },
      });

      await service.getMetaAdSetInsights('adset-1', 'last_30d');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/meta-ads/adsets/adset-1/insights',
        { params: { datePreset: 'last_30d' } },
      );
    });

    it('gets single ad insights', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { impressions: 1000 } },
      });

      await service.getMetaAdInsights('ad-1', 'last_7d');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/meta-ads/ads/ad-1/insights',
        { params: { datePreset: 'last_7d' } },
      );
    });

    it('lists ad creatives for an account', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ id: 'creative-1' }] },
      });

      await service.listMetaAdCreatives('act_1', 10);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/meta-ads/creatives',
        { params: { adAccountId: 'act_1', limit: 10 } },
      );
    });

    it('compares campaigns as a comma-joined id list', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { winner: 'campaign-1' } },
      });

      await service.compareMetaCampaigns(
        ['campaign-1', 'campaign-2'],
        'last_7d',
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/meta-ads/campaigns/compare',
        {
          params: {
            campaignIds: 'campaign-1,campaign-2',
            datePreset: 'last_7d',
          },
        },
      );
    });

    it('gets top performers ranked by a metric', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ id: 'ad-1' }] },
      });

      await service.getMetaTopPerformers('act_1', 'ctr', 5);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/meta-ads/top-performers',
        { params: { adAccountId: 'act_1', limit: 5, metric: 'ctr' } },
      );
    });

    it('throws the fixed failure message on error', async () => {
      (mockAxiosInstance.get as Mock).mockRejectedValue(new Error('nope'));

      await expect(service.listMetaAdAccounts()).rejects.toThrow(
        'Failed to list Meta ad accounts',
      );
    });
  });

  // ==================== GOOGLE ADS ====================

  describe('Google Ads', () => {
    it('lists accessible customers', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ id: 'customer-1' }] },
      });

      const result = await service.listGoogleAdsCustomers();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/google-ads/customers',
      );
      expect(result).toEqual([{ id: 'customer-1' }]);
    });

    it('lists campaigns under a login customer', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ id: 'campaign-1' }] },
      });

      await service.listGoogleAdsCampaigns(
        'customer-1',
        'ENABLED',
        50,
        'manager-1',
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/google-ads/campaigns',
        {
          params: {
            customerId: 'customer-1',
            limit: 50,
            loginCustomerId: 'manager-1',
            status: 'ENABLED',
          },
        },
      );
    });

    it('gets campaign metrics with optional date segmentation', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { clicks: 100 } },
      });

      const result = await service.getGoogleAdsCampaignMetrics(
        'customer-1',
        'campaign-1',
        '2026-08-01',
        '2026-08-06',
        true,
        'manager-1',
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/google-ads/campaigns/campaign-1/metrics',
        {
          params: {
            customerId: 'customer-1',
            endDate: '2026-08-06',
            loginCustomerId: 'manager-1',
            segmentByDate: true,
            startDate: '2026-08-01',
          },
        },
      );
      expect(result).toEqual({ clicks: 100 });
    });

    it('gets ad group insights', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { conversions: 4 } },
      });

      await service.getGoogleAdsAdGroupInsights(
        'customer-1',
        'adgroup-1',
        '2026-08-01',
        '2026-08-06',
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/google-ads/ad-groups/adgroup-1/insights',
        {
          params: {
            customerId: 'customer-1',
            endDate: '2026-08-06',
            loginCustomerId: undefined,
            startDate: '2026-08-01',
          },
        },
      );
    });

    it('gets keyword performance rows', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ keyword: 'genfeed' }] },
      });

      await service.getGoogleAdsKeywordPerformance(
        'customer-1',
        '2026-08-01',
        '2026-08-06',
        25,
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/google-ads/keywords',
        {
          params: {
            customerId: 'customer-1',
            endDate: '2026-08-06',
            limit: 25,
            loginCustomerId: undefined,
            startDate: '2026-08-01',
          },
        },
      );
    });

    it('gets the search terms report for a campaign', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: [{ term: 'ai content' }] },
      });

      await service.getGoogleAdsSearchTerms(
        'customer-1',
        'campaign-1',
        '2026-08-01',
        '2026-08-06',
        10,
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/services/google-ads/search-terms/campaign-1',
        {
          params: {
            customerId: 'customer-1',
            endDate: '2026-08-06',
            limit: 10,
            loginCustomerId: undefined,
            startDate: '2026-08-01',
          },
        },
      );
    });

    it('throws the fixed failure message on error', async () => {
      (mockAxiosInstance.get as Mock).mockRejectedValue(new Error('nope'));

      await expect(service.listGoogleAdsCustomers()).rejects.toThrow(
        'Failed to list Google Ads customers',
      );
    });
  });

  // ==================== ADS GATEWAY ====================

  describe('ads gateway insights', () => {
    it('gets ad set insights through the platform-generic gateway', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { ctr: 1.1 } },
      });

      const result = await service.getAdsAdSetInsights({
        adAccountId: 'act_1',
        credentialId: 'credential-1',
        datePreset: 'last_7d',
        entityId: 'adset-1',
        platform: 'tiktok',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ads/tiktok/adsets/adset-1/insights',
        {
          params: {
            adAccountId: 'act_1',
            credentialId: 'credential-1',
            datePreset: 'last_7d',
            loginCustomerId: undefined,
            since: undefined,
            until: undefined,
          },
        },
      );
      expect(result).toEqual({ ctr: 1.1 });
    });

    it('gets ad insights through the platform-generic gateway', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { impressions: 500 } },
      });

      await service.getAdsAdInsights({
        entityId: 'ad-1',
        loginCustomerId: 'manager-1',
        platform: 'google',
        since: '2026-08-01',
        until: '2026-08-06',
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/ads/google/ads/ad-1/insights',
        {
          params: {
            adAccountId: undefined,
            credentialId: undefined,
            datePreset: undefined,
            loginCustomerId: 'manager-1',
            since: '2026-08-01',
            until: '2026-08-06',
          },
        },
      );
    });
  });

  // ==================== LINKEDIN ====================

  describe('LinkedIn', () => {
    it('generates content variations with a default count', async () => {
      (mockAxiosInstance.post as Mock).mockResolvedValue({
        data: {
          data: [
            {
              attributes: {
                body: 'Body text',
                content: 'Full content',
                cta: 'Follow us',
                hashtags: ['#ai'],
                hook: 'Hot take',
              },
            },
            { attributes: {} },
          ],
        },
      });

      const result = await service.generateLinkedInContent({
        brandId: 'brand-1',
        topic: 'AI trends',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/content-intelligence/generate',
        {
          brandId: 'brand-1',
          platform: 'linkedin',
          topic: 'AI trends',
          variationsCount: 3,
        },
      );
      expect(result).toEqual([
        {
          body: 'Body text',
          content: 'Full content',
          cta: 'Follow us',
          hashtags: ['#ai'],
          hook: 'Hot take',
        },
        { body: '', content: '', cta: '', hashtags: [], hook: '' },
      ]);
    });

    it('reports a connected LinkedIn credential', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: {
          mentions: [
            { platform: 'instagram' },
            {
              avatar: 'https://cdn/avatar.png',
              handle: 'genfeed',
              name: 'Genfeed',
              platform: 'linkedin',
            },
          ],
        },
      });

      const result = await service.getLinkedInConnectionStatus();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/credentials/mentions',
      );
      expect(result).toEqual({
        avatar: 'https://cdn/avatar.png',
        connected: true,
        handle: 'genfeed',
        name: 'Genfeed',
        platform: 'linkedin',
      });
    });

    it('reports a disconnected state when no LinkedIn mention exists', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { mentions: [] },
      });

      const result = await service.getLinkedInConnectionStatus();

      expect(result).toEqual({
        avatar: null,
        connected: false,
        handle: null,
        name: null,
        platform: 'linkedin',
      });
    });

    it('reads LinkedIn analytics for a content item', async () => {
      (mockAxiosInstance.get as Mock).mockResolvedValue({
        data: { data: { attributes: { impressions: 1200 } } },
      });

      const result = await service.getLinkedInAnalytics('content-1', '30d');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/content-performance/content-1',
        { params: { platform: 'linkedin', timeRange: '30d' } },
      );
      expect(result).toEqual({ impressions: 1200 });
    });

    it('throws the fixed failure message on error', async () => {
      (mockAxiosInstance.get as Mock).mockRejectedValue(new Error('nope'));

      await expect(service.getLinkedInConnectionStatus()).rejects.toThrow(
        'Failed to get LinkedIn connection status',
      );
    });
  });
});
