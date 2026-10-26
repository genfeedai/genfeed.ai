import type {
  KnowledgeReceipt,
  KnowledgeRetrievalCitation,
} from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const citation = {
  kind: 'TEXT',
  purpose: 'BRAND_TRUTH',
  sourceId: 'source-1',
  title: 'Brand facts',
  url: 'https://example.com/facts',
  version: 2,
  versionId: 'version-2',
} as KnowledgeRetrievalCitation;

const passages = [
  { citation, content: 'We ship every Thursday.', relevance: 0.9 },
  {
    citation: { ...citation, sourceId: 'source-2', versionId: 'version-7' },
    content: 'Pricing starts at $29.',
    relevance: 0.7,
  },
];

/** Account-management results carry no structured content, so narrow first. */
function structuredContentOf(result: object): object {
  if (!('structuredContent' in result) || !result.structuredContent) {
    throw new Error('Expected structured content');
  }
  return result.structuredContent;
}

describe('search_knowledge over MCP', () => {
  const client = {
    evaluateMcpToolResult: vi.fn(),
    executeAgentTool: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const registry = () =>
    new ToolRegistryService(
      client as unknown as ClientService,
      logger as unknown as LoggerService,
      'superadmin',
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns one receipt per cited passage in structured content', async () => {
    client.executeAgentTool.mockResolvedValue({
      creditsUsed: 0,
      data: { message: '2 cited passages found.', passages, query: 'ship' },
      success: true,
    });

    const result = await registry().handleToolCall({
      arguments: { brandId: 'brand-1', query: 'ship' },
      name: 'search_knowledge',
    });

    const structured = structuredContentOf(result) as {
      data: { passages: unknown[] };
      receipts: KnowledgeReceipt[];
    };
    expect(structured.data.passages).toEqual(passages);
    expect(structured.receipts).toEqual([
      { ...citation, excerpt: 'We ship every Thursday.', relevance: 0.9 },
      {
        ...citation,
        excerpt: 'Pricing starts at $29.',
        relevance: 0.7,
        sourceId: 'source-2',
        versionId: 'version-7',
      },
    ]);
  });

  it('returns an empty receipt list when nothing matched', async () => {
    client.executeAgentTool.mockResolvedValue({
      creditsUsed: 0,
      data: {
        message: 'No saved Knowledge matched.',
        passages: [],
        query: 'x',
      },
      success: true,
    });

    const result = await registry().handleToolCall({
      arguments: { brandId: 'brand-1', query: 'x' },
      name: 'search_knowledge',
    });

    expect(
      (structuredContentOf(result) as { receipts: KnowledgeReceipt[] })
        .receipts,
    ).toEqual([]);
  });

  it('adds no receipts to other tools', async () => {
    client.executeAgentTool.mockResolvedValue({
      creditsUsed: 0,
      data: { sources: [] },
      success: true,
    });

    const result = await registry().handleToolCall({
      arguments: { brandId: 'brand-1' },
      name: 'list_knowledge_sources',
    });

    expect(structuredContentOf(result)).not.toHaveProperty('receipts');
  });
});
