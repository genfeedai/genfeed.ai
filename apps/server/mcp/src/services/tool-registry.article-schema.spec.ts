import { getToolByName, toMcpTools } from '@genfeedai/actions';
import type { ClientService } from '@mcp/services/client.service';
import { handleContentTool } from '@mcp/tools/content.tool';
import { vi } from 'vitest';

describe('get_articles schema contract (#6597)', () => {
  it('advertises exactly one selector on the connected MCP schema', () => {
    const definition = getToolByName('get_articles');
    expect(definition).toBeDefined();
    const tool = toMcpTools(definition ? [definition] : [])[0];
    expect(tool.inputSchema).toMatchObject({
      oneOf: [{ required: ['articleId'] }, { required: ['query'] }],
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
  const getArticle = vi
    .fn()
    .mockResolvedValue({ id: 'article-1', title: 'Title' });
  const searchArticles = vi.fn().mockResolvedValue([]);
  const client = { getArticle, searchArticles } as unknown as ClientService;

  beforeEach(() => vi.clearAllMocks());

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
      expect(getArticle).not.toHaveBeenCalled();
      expect(searchArticles).not.toHaveBeenCalled();
    },
  );

  it('gets a single article by its trimmed selector', async () => {
    await handleContentTool(client, 'get_articles', {
      articleId: ' article-1 ',
    });
    expect(getArticle).toHaveBeenCalledWith('article-1');
    expect(searchArticles).not.toHaveBeenCalled();
  });

  it('searches by the trimmed query with search options', async () => {
    await handleContentTool(client, 'get_articles', {
      query: ' topic ',
      limit: 2,
    });
    expect(searchArticles).toHaveBeenCalledWith({
      query: 'topic',
      limit: 2,
      category: undefined,
    });
    expect(getArticle).not.toHaveBeenCalled();
  });
});
