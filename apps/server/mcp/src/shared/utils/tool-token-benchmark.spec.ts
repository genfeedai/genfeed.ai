import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  DEFAULT_MCP_PROFILE_TOOLSETS,
  getToolsForSurface,
  getToolsForToolsets,
  toMcpTools,
} from '@genfeedai/actions';
import { dataToolResult } from '@mcp/shared/utils/tool-result-text.util';

/** Same fixtures run on both revisions; no provider calls or production data. */
it('exports deterministic MCP token benchmark payloads when requested', () => {
  const paragraph =
    'Publish useful content with a consistent brand voice. '.repeat(24);
  const rows = Array.from({ length: 24 }, (_, index) => ({
    id: `fixture-${index}`,
    title: `Campaign ${index}`,
    status: 'DRAFT',
    content: paragraph,
    brandId: 'fixture-brand',
    metrics: { views: 1200, likes: 42, clicks: 15 },
    channels: ['linkedin', 'instagram'],
  }));
  const fixtures = {
    'small-status': { status: 'FAILED', message: 'Reconnect the account.' },
    'post-list': { posts: rows, nextCursor: 'fixture-next-page', total: 84 },
    'brand-list': {
      brands: rows.map(({ content, ...row }) => ({
        ...row,
        description: content,
        voice: { tone: 'Direct', examples: [paragraph] },
      })),
    },
    analytics: {
      channels: rows.map(({ content, ...row }) => ({
        ...row,
        analysis: content,
        daily: rows.map(({ id, metrics }) => ({ date: id, ...metrics })),
      })),
    },
    'article-detail': {
      title: 'Campaign article',
      status: 'DRAFT',
      content: paragraph.repeat(8),
    },
    'generation-receipt': {
      status: 'GENERATED',
      generationHarness: {
        enhancedPrompt: paragraph,
        originalPrompt: 'A brand campaign image',
        status: 'applied',
        source: 'brand',
        appliedPacks: [{ id: 'voice', version: '1' }],
      },
    },
  };
  const payloads: Record<string, unknown> = {
    'catalog/default': {
      tools: toMcpTools(
        getToolsForToolsets('mcp', DEFAULT_MCP_PROFILE_TOOLSETS),
      ),
    },
    'catalog/full': { tools: toMcpTools(getToolsForSurface('mcp')) },
  };
  for (const [name, data] of Object.entries(fixtures)) {
    const result = dataToolResult(data);
    expect(result.structuredContent.data).toBe(data);
    payloads[`result/${name}/text`] = result.content;
    payloads[`result/${name}/structured`] = result.structuredContent;
    payloads[`result/${name}/combined`] = result;
  }
  const destination = process.env.MCP_TOKEN_BENCHMARK_OUTPUT;
  if (destination) {
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify({ fixtureVersion: 1, payloads }));
  }
});
