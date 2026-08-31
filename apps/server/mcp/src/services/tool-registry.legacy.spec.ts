import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * Covers the hand-written `handleLegacyTool` switch — the REST-backed tools that
 * predate the canonical registry. Each case is exercised through the public
 * `handleToolCall` path so the classifier, the role check and the legacy
 * formatting all run together. `create_article` is approval-gated, so it is
 * reached through the `resolve_approval` execution path instead.
 */
const LEGACY_NAMES = [
  'get_video_status',
  'list_videos',
  'get_video_analytics',
  'create_article',
  'search_articles',
  'get_article',
  'list_images',
  'list_avatars',
  'list_music',
  'get_workflow_status',
  'list_workflow_templates',
  'get_content_analytics',
  'get_usage_stats',
  'generate_linkedin_content',
  'get_linkedin_connection_status',
  'get_linkedin_analytics',
];

const APPROVAL_GATED_NAMES = [
  'create_post',
  'create_article',
  'generate_content_batch',
  'start_brand_interview',
  'submit_brand_interview_answer',
  'skip_brand_interview_question',
  'approve_social_draft',
  'post_social_reply',
  'send_social_dm',
  'analyze_clip_project',
  'create_clip_project_from_youtube',
  'generate_clips',
  'create_ad_remix_workflow',
  'create_instagram_remix_workflow',
  'create_scheduled_release',
  'update_scheduled_release',
  'control_scheduled_release',
  'install_skills_pro_skill',
];

const MOCK_TOOLS = new Map(
  [
    ...LEGACY_NAMES,
    ...APPROVAL_GATED_NAMES,
    'generate_image',
    'resolve_approval',
  ].map((name) => [name, { name, surfaces: { mcp: true } }]),
);

vi.mock('@genfeedai/actions', () => ({
  getToolByName: vi.fn((name: string) => MOCK_TOOLS.get(name)),
  getToolsForSurface: vi.fn(() => [...MOCK_TOOLS.values()]),
  toMcpTools: vi.fn((tools) => tools),
}));

vi.mock('@mcp/guards/mcp-auth.guard', () => ({
  McpAuthGuard: { checkToolRole: vi.fn() },
}));

function build() {
  const client = {
    attachApprovalResult: vi.fn().mockResolvedValue({ id: 'apr-1' }),
    createApproval: vi
      .fn()
      .mockImplementation((toolName: string) =>
        Promise.resolve({ id: 'apr-1', status: 'PENDING', toolName }),
      ),
    createArticle: vi.fn().mockResolvedValue({
      id: 'article-1',
      status: 'draft',
      title: 'AI News',
      wordCount: 820,
    }),
    executeAgentTool: vi
      .fn()
      .mockResolvedValue({ data: { id: 'image-1' }, success: true }),
    generateLinkedInContent: vi
      .fn()
      .mockResolvedValue([{ text: 'Variation A' }]),
    getArticle: vi.fn().mockResolvedValue({
      content: 'Long form body',
      createdAt: '2026-08-01T00:00:00.000Z',
      id: 'article-1',
      status: 'published',
      title: 'AI News',
      wordCount: 820,
    }),
    getLinkedInAnalytics: vi
      .fn()
      .mockResolvedValue({ impressions: 4200, reactions: 88 }),
    getLinkedInConnectionStatus: vi
      .fn()
      .mockResolvedValue({ connected: true, profile: 'in/genfeed' }),
    getUsageStats: vi.fn().mockResolvedValue({
      contentCreated: {
        articles: 4,
        avatars: 1,
        images: 12,
        music: 2,
        videos: 7,
      },
      creditsUsed: 340,
      postsPublished: 9,
      timeRange: '30d',
      totalEngagement: 5100,
    }),
    getVideoAnalytics: vi
      .fn()
      .mockResolvedValue({ views: 1200, watchTime: 90 }),
    getWorkflowStatus: vi.fn().mockResolvedValue({
      id: 'workflow-1',
      lastRunAt: '2026-08-01T00:00:00.000Z',
      name: 'Daily digest',
      nextRunAt: '2026-08-09T00:00:00.000Z',
      nodeCount: 3,
      status: 'RUNNING',
      version: 4,
    }),
    listAvatars: vi.fn().mockResolvedValue([{ id: 'avatar-1' }]),
    listImages: vi.fn().mockResolvedValue([{ id: 'image-1' }]),
    listMusic: vi.fn().mockResolvedValue([{ id: 'track-1' }]),
    listWorkflowTemplates: vi.fn().mockResolvedValue([
      {
        category: 'content',
        creditsRequired: 5,
        description: 'Daily digest generator',
        id: 'template-1',
        name: 'Digest',
      },
    ]),
    resolveApproval: vi.fn(),
    searchArticles: vi.fn().mockResolvedValue([{ id: 'article-1' }]),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const registry = new ToolRegistryService(
    client as unknown as ClientService,
    logger as unknown as LoggerService,
    'admin',
  );
  return { client, logger, registry };
}

type ToolResult = {
  component?: { url: string };
  content: { text: string }[];
  isError?: boolean;
};

async function callTool(
  registry: ToolRegistryService,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  return (await registry.handleToolCall({
    arguments: args,
    name,
  })) as ToolResult;
}

describe('ToolRegistryService — boot-time drift guard', () => {
  it('validates dispatch coverage on module init', () => {
    const { registry } = build();

    expect(() => registry.onModuleInit()).not.toThrow();
  });
});

describe('handleLegacyTool — video', () => {
  it('reports video analytics with the default time range', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'get_video_analytics', {
      videoId: 'video-1',
    });

    expect(client.getVideoAnalytics).toHaveBeenCalledWith('video-1', '7d');
    expect(result.content[0].text).toContain('Video Analytics (7d)');
  });

  it('honours an explicit analytics time range', async () => {
    const { client, registry } = build();

    await callTool(registry, 'get_video_analytics', {
      timeRange: '30d',
      videoId: 'video-1',
    });

    expect(client.getVideoAnalytics).toHaveBeenCalledWith('video-1', '30d');
  });

  it('requires a videoId for analytics', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'get_video_analytics', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('videoId required');
    expect(client.getVideoAnalytics).not.toHaveBeenCalled();
  });
});

describe('handleLegacyTool — articles', () => {
  it('creates an article through the approval execution path', async () => {
    const { client, registry } = build();
    client.resolveApproval.mockResolvedValue({
      arguments: {
        keywords: ['ai'],
        length: 'medium',
        targetAudience: 'founders',
        tone: 'professional',
        topic: 'AI news',
      },
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'create_article',
    });

    const result = await callTool(registry, 'resolve_approval', {
      approvalId: 'apr-1',
      decision: 'approve',
    });

    expect(client.createArticle).toHaveBeenCalledWith({
      keywords: ['ai'],
      length: 'medium',
      targetAudience: 'founders',
      tone: 'professional',
      topic: 'AI news',
    });
    expect(result.content[0].text).toContain('Article created successfully!');
    expect(result.content[0].text).toContain('article-1');
  });

  it('queues an approval rather than creating an article directly', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'create_article', {
      topic: 'AI news',
    });

    expect(client.createApproval).toHaveBeenCalledWith('create_article', {
      topic: 'AI news',
    });
    expect(client.createArticle).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('requires approval');
  });

  it('searches articles and links the result list', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'search_articles', {
      category: 'news',
      limit: 5,
      query: 'ai video',
    });

    expect(client.searchArticles).toHaveBeenCalledWith({
      category: 'news',
      limit: 5,
      query: 'ai video',
    });
    expect(result.content[0].text).toContain(
      'Found 1 articles matching "ai video"',
    );
    expect(result.component?.url).toContain('q=ai%20video');
  });

  it('reports an empty article search', async () => {
    const { client, registry } = build();
    client.searchArticles.mockResolvedValue([]);

    const result = await callTool(registry, 'search_articles', {
      query: 'nothing',
    });

    expect(result.content[0].text).toBe(
      'No articles found matching "nothing".',
    );
  });

  it('requires a search query', async () => {
    const { registry } = build();

    const result = await callTool(registry, 'search_articles', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('query required');
  });

  it('renders a single article with a content preview', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'get_article', {
      articleId: 'article-1',
    });

    expect(client.getArticle).toHaveBeenCalledWith('article-1');
    expect(result.content[0].text).toContain('Article: AI News');
    expect(result.content[0].text).toContain('Long form body');
  });

  it('requires an articleId', async () => {
    const { registry } = build();

    const result = await callTool(registry, 'get_article', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('articleId required');
  });
});

describe('handleLegacyTool — media libraries', () => {
  it('lists images with pagination forwarded', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'list_images', {
      limit: 10,
      offset: 20,
    });

    expect(client.listImages).toHaveBeenCalledWith({ limit: 10, offset: 20 });
    expect(result.content[0].text).toContain('Found 1 images');
  });

  it('reports an empty image library', async () => {
    const { client, registry } = build();
    client.listImages.mockResolvedValue([]);

    const result = await callTool(registry, 'list_images', {});

    expect(result.content[0].text).toBe('No images found.');
  });

  it('lists avatars', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'list_avatars', { limit: 5 });

    expect(client.listAvatars).toHaveBeenCalledWith({ limit: 5 });
    expect(result.content[0].text).toContain('Found 1 avatars');
  });

  it('reports an empty avatar library', async () => {
    const { client, registry } = build();
    client.listAvatars.mockResolvedValue([]);

    const result = await callTool(registry, 'list_avatars', {});

    expect(result.content[0].text).toBe('No avatars found.');
  });

  it('lists music tracks', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'list_music', { limit: 3 });

    expect(client.listMusic).toHaveBeenCalledWith({ limit: 3 });
    expect(result.content[0].text).toContain('Found 1 music tracks');
  });

  it('reports an empty music library', async () => {
    const { client, registry } = build();
    client.listMusic.mockResolvedValue([]);

    const result = await callTool(registry, 'list_music', {});

    expect(result.content[0].text).toBe('No music tracks found.');
  });
});

describe('handleLegacyTool — workflows', () => {
  it('renders workflow status with its pinned version and node count', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'get_workflow_status', {
      workflowId: 'workflow-1',
    });

    expect(client.getWorkflowStatus).toHaveBeenCalledWith('workflow-1');
    expect(result.content[0].text).toContain('Version: 4');
    expect(result.content[0].text).toContain('Nodes: 3');
    expect(result.content[0].text).toContain('Workflow Status: Daily digest');
  });

  it('falls back to N/A and Never when the workflow has not run', async () => {
    const { client, registry } = build();
    client.getWorkflowStatus.mockResolvedValue({
      id: 'workflow-2',
      name: 'Idle',
      status: 'IDLE',
    });

    const result = await callTool(registry, 'get_workflow_status', {
      workflowId: 'workflow-2',
    });

    expect(result.content[0].text).toContain('Version: N/A');
    expect(result.content[0].text).toContain('Nodes: 0');
    expect(result.content[0].text).toContain('Last Run: Never');
    expect(result.content[0].text).toContain('Next Run: Not scheduled');
  });

  it('requires a workflowId', async () => {
    const { registry } = build();

    const result = await callTool(registry, 'get_workflow_status', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('workflowId required');
  });

  it('lists workflow templates with their credit cost', async () => {
    const { registry } = build();

    const result = await callTool(registry, 'list_workflow_templates', {});

    expect(result.content[0].text).toContain('Available Workflow Templates');
    expect(result.content[0].text).toContain('Digest (template-1)');
    expect(result.content[0].text).toContain('Credits: 5');
  });

  it('omits the credit line for a free template', async () => {
    const { client, registry } = build();
    client.listWorkflowTemplates.mockResolvedValue([
      {
        category: 'content',
        description: 'Free template',
        id: 'template-2',
        name: 'Free',
      },
    ]);

    const result = await callTool(registry, 'list_workflow_templates', {});

    expect(result.content[0].text).not.toContain('Credits:');
  });

  it('reports an empty template catalog', async () => {
    const { client, registry } = build();
    client.listWorkflowTemplates.mockResolvedValue([]);

    const result = await callTool(registry, 'list_workflow_templates', {});

    expect(result.content[0].text).toBe('No workflow templates available.');
  });
});

describe('handleLegacyTool — usage and LinkedIn', () => {
  it('defaults usage stats to a 30d window', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'get_usage_stats', {});

    expect(client.getUsageStats).toHaveBeenCalledWith('30d');
    expect(result.content[0].text).toContain('Usage Statistics (30d)');
    expect(result.content[0].text).toContain('Credits Used: 340');
    expect(result.component?.url).toContain('range=30d');
  });

  it('honours an explicit usage time range', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'get_usage_stats', {
      timeRange: '7d',
    });

    expect(client.getUsageStats).toHaveBeenCalledWith('7d');
    expect(result.component?.url).toContain('range=7d');
  });

  it('generates LinkedIn variations with a default count of 3', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'generate_linkedin_content', {
      brandId: 'brand-1',
      topic: 'Launch week',
    });

    expect(client.generateLinkedInContent).toHaveBeenCalledWith({
      brandId: 'brand-1',
      topic: 'Launch week',
      variationsCount: 3,
    });
    expect(result.content[0].text).toContain(
      'Generated 1 LinkedIn content variations',
    );
  });

  it('honours an explicit variations count', async () => {
    const { client, registry } = build();

    await callTool(registry, 'generate_linkedin_content', {
      topic: 'Launch week',
      variationsCount: 5,
    });

    expect(client.generateLinkedInContent).toHaveBeenCalledWith(
      expect.objectContaining({ variationsCount: 5 }),
    );
  });

  it('reports when no LinkedIn content came back', async () => {
    const { client, registry } = build();
    client.generateLinkedInContent.mockResolvedValue([]);

    const result = await callTool(registry, 'generate_linkedin_content', {
      topic: 'Launch week',
    });

    expect(result.content[0].text).toBe('No content generated.');
  });

  it('requires a topic for LinkedIn generation', async () => {
    const { registry } = build();

    const result = await callTool(registry, 'generate_linkedin_content', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('topic is required');
  });

  it('returns the LinkedIn connection status verbatim', async () => {
    const { client, registry } = build();

    const result = await callTool(
      registry,
      'get_linkedin_connection_status',
      {},
    );

    expect(client.getLinkedInConnectionStatus).toHaveBeenCalled();
    expect(result.content[0].text).toContain('in/genfeed');
  });

  it('defaults LinkedIn analytics to a 7d window', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'get_linkedin_analytics', {
      contentId: 'content-1',
    });

    expect(client.getLinkedInAnalytics).toHaveBeenCalledWith('content-1', '7d');
    expect(result.content[0].text).toContain('4200');
  });

  it('honours an explicit LinkedIn analytics range', async () => {
    const { client, registry } = build();

    await callTool(registry, 'get_linkedin_analytics', {
      contentId: 'content-1',
      timeRange: '90d',
    });

    expect(client.getLinkedInAnalytics).toHaveBeenCalledWith(
      'content-1',
      '90d',
    );
  });

  it('requires a contentId for LinkedIn analytics', async () => {
    const { registry } = build();

    const result = await callTool(registry, 'get_linkedin_analytics', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('contentId is required');
  });
});

describe('ToolRegistryService — agent result mapping', () => {
  it('maps a failed agent tool result to an MCP error', async () => {
    const { client, registry } = build();
    client.executeAgentTool.mockResolvedValue({
      error: 'model unavailable',
      success: false,
    });

    const result = await callTool(registry, 'generate_image', {
      prompt: 'a cat',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: model unavailable');
  });

  it('falls back to a generic message when the failure has no error text', async () => {
    const { client, registry } = build();
    client.executeAgentTool.mockResolvedValue({ success: false });

    const result = await callTool(registry, 'generate_image', {
      prompt: 'a cat',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Tool execution failed');
  });

  it('does not let an approval audit-write failure mask the tool result', async () => {
    const { client, logger, registry } = build();
    client.resolveApproval.mockResolvedValue({
      arguments: { topic: 'AI news' },
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'create_article',
    });
    client.attachApprovalResult.mockRejectedValue(new Error('audit down'));

    const result = await callTool(registry, 'resolve_approval', {
      approvalId: 'apr-1',
      decision: 'approve',
    });

    expect(result.content[0].text).toContain('Article created successfully!');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to attach result to approval apr-1'),
      expect.any(Error),
    );
  });
});
