import type { ClientService } from '@mcp/services/client.service';
import { handleContentTool } from '@mcp/tools/content.tool';
import { toMcpToolErrorResult } from '@mcp/tools/mcp-tool-error';
import { describe, expect, it } from 'vitest';

const client = {
  getArticle: async () => ({
    content: 'Body',
    createdAt: '2026-11-01',
    status: 'draft',
    title: 'One',
    wordCount: 1,
  }),
  searchArticles: async () => [],
} as unknown as ClientService;

async function failureOf(args: Record<string, unknown>) {
  try {
    await handleContentTool(client, 'get_articles', args);
  } catch (error: unknown) {
    return toMcpToolErrorResult(error);
  }
  return null;
}

describe('get_articles caller mistakes', () => {
  it.each([
    [
      { brandId: 'brand-1', query: 'launch' },
      'brandId: brandId applies only when reading one article by articleId',
    ],
    [
      { articleId: 'a1', limit: 5 },
      'limit: category and limit apply only to a query search',
    ],
    [
      { articleId: 'a1', query: 'launch' },
      'articleId: Pass exactly one of articleId',
    ],
    [{}, 'query: Pass exactly one of articleId'],
  ])('tells the agent how to repair %j', async (args, text) => {
    const result = await failureOf(args);

    expect(result?.isError).toBe(true);
    expect(result?.structuredContent.code).toBe('validation_failed');
    expect(result?.content[0].text).toContain(text);
  });

  it('still reads one article with its brand', async () => {
    const result = await handleContentTool(client, 'get_articles', {
      articleId: 'a1',
      brandId: 'brand-1',
    });

    expect(result.content[0].text).toContain('Article: One');
  });
});
