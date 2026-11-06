import { getToolByName, toMcpTools } from '@genfeedai/actions';
import type { ClientService } from '@mcp/services/client.service';
import { handleContentTool } from '@mcp/tools/content.tool';

describe('get_articles schema contract (#6597)', () => {
  it('advertises exactly one selector on the connected MCP schema', () => {
    const definition = getToolByName('get_articles');
    expect(definition).toBeDefined();
    const tool = toMcpTools(definition ? [definition] : [])[0];
    expect(tool.inputSchema).toMatchObject({
      oneOf: [
        {
          properties: { articleId: { type: 'string' } },
          required: ['articleId'],
        },
        { properties: { query: { type: 'string' } }, required: ['query'] },
      ],
      properties: {
        articleId: { minLength: 1, pattern: '\\S', type: 'string' },
        query: { minLength: 1, pattern: '\\S', type: 'string' },
      },
    });
    expect(tool.description).toContain(
      'Pass exactly one of articleId or query',
    );
  });
});

describe('get_articles runtime selectors', () => {
  const articles = [
    { id: 'article-1', title: 'Topic deep dive' },
    { id: 'article-2', title: 'Unrelated launch notes' },
  ];
  let apiRequests: unknown[][];
  const client = {
    getArticle: async (id: string) => {
      apiRequests.push(['getArticle', id]);
      return articles.find((article) => article.id === id) ?? null;
    },
    searchArticles: async (options: { limit?: number; query: string }) => {
      apiRequests.push(['searchArticles', options]);
      return articles
        .filter((article) =>
          article.title.toLowerCase().includes(options.query),
        )
        .slice(0, options.limit);
    },
  } as unknown as ClientService;

  beforeEach(() => {
    apiRequests = [];
  });

  it.each([
    {},
    { articleId: 'article-1', query: 'topic' },
    { articleId: 'article-1', query: '' },
    { articleId: 'article-1', query: 123 },
    { query: 'topic', articleId: '' },
    { query: 'topic', articleId: 123 },
    { articleId: ' ' },
    { query: ' ' },
    { articleId: 123 },
    { query: 123 },
  ])(
    'rejects invalid or ambiguous selectors %j before calling the API',
    async (args) => {
      await expect(
        handleContentTool(client, 'get_articles', args),
      ).rejects.toThrow('Pass exactly one of articleId or query');
      expect(apiRequests).toEqual([]);
    },
  );

  it('gets a single article by its trimmed selector', async () => {
    const result = await handleContentTool(client, 'get_articles', {
      articleId: ' article-1 ',
    });
    expect(JSON.stringify(result)).toContain('Topic deep dive');
    expect(apiRequests).toEqual([['getArticle', 'article-1']]);
  });

  it('searches by the trimmed query with search options', async () => {
    const result = await handleContentTool(client, 'get_articles', {
      query: ' topic ',
      limit: 2,
    });
    expect(JSON.stringify(result)).toContain('Topic deep dive');
    expect(JSON.stringify(result)).not.toContain('Unrelated launch notes');
    expect(apiRequests).toEqual([
      ['searchArticles', { query: 'topic', limit: 2, category: undefined }],
    ]);
  });
});
