import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * Covers the MCP catalog REST handlers (content, analytics,
 * workflow-status). Each case is exercised through the public
 * `handleToolCall` path so the classifier, the role check and the response
 * formatting all run together. `create_article_draft` is approval-gated, so it
 * is reached through the `resolve_approval` execution path instead.
 */
const CATALOG_REST_NAMES = [
  'get_video_analytics',
  'create_article_draft',
  'get_article_preview',
  'publish_article',
  'get_articles',
  'get_workflow_status',
  'list_workflow_templates',
  'get_content_analytics',
  'get_linkedin_connection_status',
  'get_linkedin_analytics',
];

const APPROVAL_GATED_NAMES = [
  'create_post',
  'create_article_draft',
  'publish_article',
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

const APPROVAL_GATED = new Set<string>(APPROVAL_GATED_NAMES);

const MOCK_TOOLS = new Map(
  [
    ...CATALOG_REST_NAMES,
    ...APPROVAL_GATED_NAMES,
    'generate',
    'generate_content',
    'get_generation_options',
    'transform_media',
    'create_brand_from_url',
    'get_brand_scan_status',
    'resolve_approval',
  ].map((name) => [
    name,
    {
      mutationPolicy: APPROVAL_GATED.has(name)
        ? ('approval-required' as const)
        : undefined,
      name,
      surfaces: { mcp: true },
    },
  ]),
);

vi.mock('@genfeedai/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/actions')>();
  return {
    ...actual,
    getToolByName: vi.fn((name: string) => MOCK_TOOLS.get(name)),
    getToolsForSurface: vi.fn(
      (surface: Parameters<typeof actual.getToolsForSurface>[0]) =>
        surface === 'mcp'
          ? [...MOCK_TOOLS.values()]
          : actual.getToolsForSurface(surface),
    ),
    toMcpTools: vi.fn((tools) => tools),
  };
});

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
    createArticleDraft: vi.fn().mockResolvedValue({
      id: 'article-2',
      status: 'DRAFT',
      title: 'Reviewed guide',
    }),
    getArticlePreview: vi.fn().mockResolvedValue({
      url: 'https://genfeed.ai/articles/reviewed-guide?previewToken=private',
      expiresInSeconds: 3600,
    }),
    publishArticle: vi.fn().mockResolvedValue({
      id: 'article-2',
      status: 'PUBLISHED',
      title: 'Reviewed guide',
    }),
    executeAgentTool: vi
      .fn()
      .mockResolvedValue({ data: { id: 'image-1' }, success: true }),
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
  structuredContent?: {
    data: unknown;
    genfeedCards?: { cards: unknown[]; title: string };
  };
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

describe('catalog REST handlers — video', () => {
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

describe('catalog REST handlers — articles', () => {
  it.each(['create_article_draft', 'publish_article'])(
    'queues %s before any CMS write',
    async (name) => {
      const { client, registry } = build();
      const args =
        name === 'publish_article'
          ? { articleId: 'article-2' }
          : {
              label: 'Reviewed guide',
              slug: 'reviewed-guide',
              summary: 'Verified',
              content: '<p>Full content</p>',
            };
      const result = await callTool(registry, name, args);
      expect(client.createApproval).toHaveBeenCalledWith(name, args);
      expect(client.createArticleDraft).not.toHaveBeenCalled();
      expect(client.publishArticle).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('requires approval');
    },
  );

  it('saves full reviewed HTML when draft creation is approved', async () => {
    const { client, registry } = build();
    const args = {
      label: 'Reviewed guide',
      slug: 'reviewed-guide',
      summary: 'Verified',
      content: '<p>Full content</p>',
    };
    client.resolveApproval.mockResolvedValue({
      arguments: args,
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'create_article_draft',
    });
    const result = await callTool(registry, 'resolve_approval', {
      approvalId: 'apr-1',
      decision: 'approve',
    });
    expect(client.createArticleDraft).toHaveBeenCalledWith(args);
    expect(client.publishArticle).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('saved as a draft');
  });

  it('publishes only after approval without forwarding new content', async () => {
    const { client, registry } = build();
    client.resolveApproval.mockResolvedValue({
      arguments: { articleId: 'article-2' },
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'publish_article',
    });
    const result = await callTool(registry, 'resolve_approval', {
      approvalId: 'apr-1',
      decision: 'approve',
    });
    expect(client.publishArticle).toHaveBeenCalledWith('article-2');
    expect(result.content[0].text).toContain('PUBLISHED');
  });

  it('returns a private preview through the read handler', async () => {
    const { client, registry } = build();
    const result = await callTool(registry, 'get_article_preview', {
      articleId: 'article-2',
    });
    expect(client.getArticlePreview).toHaveBeenCalledWith('article-2');
    expect(client.createApproval).not.toHaveBeenCalled();
    expect(result.structuredContent?.data).toMatchObject({
      expiresInSeconds: 3600,
    });
  });

  it('searches articles and links the result list', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'get_articles', {
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
    expect(result.structuredContent?.genfeedCards?.cards).toHaveLength(1);
    expect(result).not.toHaveProperty('component');
  });

  it('reports an empty article search', async () => {
    const { client, registry } = build();
    client.searchArticles.mockResolvedValue([]);

    const result = await callTool(registry, 'get_articles', {
      query: 'nothing',
    });

    expect(result.content[0].text).toBe(
      'No articles found matching "nothing".',
    );
  });

  it('requires exactly one of articleId or query', async () => {
    const { client, registry } = build();

    const neither = await callTool(registry, 'get_articles', {});
    const both = await callTool(registry, 'get_articles', {
      articleId: 'article-1',
      query: 'ai video',
    });

    for (const result of [neither, both]) {
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Pass exactly one of articleId or query',
      );
    }
    expect(client.getArticle).not.toHaveBeenCalled();
    expect(client.searchArticles).not.toHaveBeenCalled();
  });

  it('renders a single article with a content preview', async () => {
    const { client, registry } = build();

    const result = await callTool(registry, 'get_articles', {
      articleId: 'article-1',
    });

    expect(client.getArticle).toHaveBeenCalledWith('article-1');
    expect(client.searchArticles).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('Article: AI News');
    expect(result.content[0].text).toContain('Long form body');
  });

  it('rejects search-only fields when fetching one article', async () => {
    const { client, registry } = build();

    for (const extra of [{ category: 'news' }, { limit: 5 }]) {
      const result = await callTool(registry, 'get_articles', {
        articleId: 'article-1',
        ...extra,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'category and limit apply only to a query search',
      );
    }
    expect(client.getArticle).not.toHaveBeenCalled();
  });
});

describe('catalog REST handlers — workflows', () => {
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

describe('catalog REST handlers — LinkedIn', () => {
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
  it.each([
    [
      'edit',
      { imageId: 'image-1', operation: 'edit', prompt: 'Change the sign' },
    ],
    [
      'reframe',
      { aspectRatio: '9:16', imageId: 'image-1', operation: 'reframe' },
    ],
    [
      'upscale',
      { imageUrl: 'https://cdn.example.com/a.png', operation: 'upscale' },
    ],
    ['merge', { ids: ['clip-1', 'clip-2'], operation: 'merge' }],
  ])(
    'proxies transform_media %s through the agent executor with no MCP-side handler',
    async (_operation, args) => {
      const { client, registry } = build();

      const result = await callTool(registry, 'transform_media', args);

      expect(client.executeAgentTool).toHaveBeenCalledWith(
        'transform_media',
        args,
        undefined,
      );
      expect(client.createApproval).not.toHaveBeenCalled();
      expect(result.isError).toBeUndefined();
    },
  );

  it('renders a transform_media result as the card kind the executor reports', async () => {
    const { client, registry } = build();
    client.executeAgentTool.mockResolvedValue({
      data: { id: 'merged-1', kind: 'video', status: 'processing' },
      success: true,
    });

    const result = await callTool(registry, 'transform_media', {
      ids: ['clip-1', 'clip-2'],
      operation: 'merge',
    });

    expect(result.structuredContent?.genfeedCards?.cards[0]).toMatchObject({
      id: 'merged-1',
      kind: 'video',
    });
  });

  it.each([
    ['generate_content', { topic: 'Launch week', type: 'post' }],
    ['get_generation_options', { type: 'image' }],
  ])('proxies %s through the agent executor', async (name, args) => {
    const { client, registry } = build();

    await callTool(registry, name, args);

    expect(client.executeAgentTool).toHaveBeenCalledWith(name, args, undefined);
    expect(client.createApproval).not.toHaveBeenCalled();
  });

  it('maps a failed agent tool result to an MCP error', async () => {
    const { client, registry } = build();
    client.executeAgentTool.mockResolvedValue({
      error: 'model unavailable',
      success: false,
    });

    const result = await callTool(registry, 'generate', {
      prompt: 'a cat',
      type: 'image',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: model unavailable');
  });

  it('falls back to a generic message when the failure has no error text', async () => {
    const { client, registry } = build();
    client.executeAgentTool.mockResolvedValue({ success: false });

    const result = await callTool(registry, 'generate', {
      prompt: 'a cat',
      type: 'image',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Tool execution failed');
  });

  it('does not let an approval audit-write failure mask the tool result', async () => {
    const { client, logger, registry } = build();
    client.resolveApproval.mockResolvedValue({
      arguments: {
        content: '<p>Full content</p>',
        label: 'Reviewed guide',
        slug: 'reviewed-guide',
        summary: 'Verified',
      },
      id: 'apr-1',
      status: 'APPROVED',
      toolName: 'create_article_draft',
    });
    client.attachApprovalResult.mockRejectedValue(new Error('audit down'));

    const result = await callTool(registry, 'resolve_approval', {
      approvalId: 'apr-1',
      decision: 'approve',
    });

    expect(result.content[0].text).toContain('saved as a draft');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to attach result to approval apr-1'),
      expect.any(Error),
    );
  });
});

describe('Brand URL tools', () => {
  it.each(['create_brand_from_url', 'get_brand_scan_status'])(
    'proxies %s directly without an approval queue',
    async (name) => {
      const { registry, client } = build();
      await callTool(registry, name, {
        url: 'https://example.com',
        brandId: 'brand-1',
      });
      expect(client.executeAgentTool).toHaveBeenCalledWith(
        name,
        expect.objectContaining({ brandId: 'brand-1' }),
        undefined,
      );
      expect(client.createApproval).not.toHaveBeenCalled();
    },
  );
  it('lists both tools when selecting the brand toolset', () => {
    const { registry } = build();
    const names = registry
      .getToolsForRoleAndToolsets('user', ['brand'])
      .map((tool) => tool.name);
    expect(names).toContain('create_brand_from_url');
    expect(names).toContain('get_brand_scan_status');
  });
});
