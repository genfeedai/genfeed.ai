import { MCP_TOOL_RESULT_MAX_JSON_BYTES } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { finalizeMcpToolResult } from '@mcp/services/mcp-tool-result.util';
import type { McpAppResult } from '@mcp/shared/interfaces/mcp-app.interface';
import { withCardResult } from '@mcp/ui/card-data';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { metricsCount } = vi.hoisted(() => ({ metricsCount: vi.fn() }));
vi.mock('@sentry/nestjs', () => ({ metrics: { count: metricsCount } }));

const client = {
  evaluateMcpToolResult: vi.fn<ClientService['evaluateMcpToolResult']>(),
} satisfies Pick<ClientService, 'evaluateMcpToolResult'>;
const logger = { warn: vi.fn<LoggerService['warn']>() } satisfies Pick<
  LoggerService,
  'warn'
>;
function result(text = 'raw instruction') {
  return {
    content: [
      { type: 'text', text },
      { type: 'resource', resource: { uri: 'private', text } },
    ],
    structuredContent: {
      data: [{ id: 'article', title: text }],
      genfeedCards: { private: text },
    },
  };
}

describe('finalizeMcpToolResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.evaluateMcpToolResult.mockResolvedValue({
      content: 'adapter replacement',
      outcome: 'allowed',
    });
  });

  it.each([
    ['search_articles', true],
    ['unknown_native', false],
    ['list_posts', false],
  ] as const)(
    'skips proxy or unmapped %s results',
    async (name, isAgentExecutor) => {
      const raw = result();
      expect(
        await finalizeMcpToolResult(name, raw, isAgentExecutor, client, logger),
      ).toEqual(withCardResult(name, raw));
      expect(client.evaluateMcpToolResult).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['off', 'allowed'],
    ['allowed', 'allowed'],
    ['shadow', 'shadow_flagged'],
  ] as const)(
    'preserves original handler result/cards for %s despite differing adapter content',
    async (_mode, outcome) => {
      const raw = result();
      const before = structuredClone(raw);
      client.evaluateMcpToolResult.mockResolvedValue({
        content: 'different adapter content',
        outcome,
      });
      const final = await finalizeMcpToolResult(
        'search_articles',
        raw,
        false,
        client,
        logger,
      );
      expect(final).toEqual(withCardResult('search_articles', raw));
      expect(client.evaluateMcpToolResult).toHaveBeenCalledExactlyOnceWith(
        'search_articles',
        JSON.stringify(before),
      );
      expect(raw).toEqual(before);
      expect(logger.warn).not.toHaveBeenCalled();
    },
  );

  it('returns only the exact withheld notice without resource, structured or card data', async () => {
    const raw = result('RAW_PRIVATE');
    client.evaluateMcpToolResult.mockResolvedValue({
      content: 'untrusted replacement',
      outcome: 'withheld',
    });
    expect(
      await finalizeMcpToolResult(
        'search_articles',
        raw,
        false,
        client,
        logger,
      ),
    ).toEqual({
      content: [
        {
          type: 'text',
          text: 'tool result withheld: suspected instruction injection',
        },
      ],
      isError: true,
    });
    expect(client.evaluateMcpToolResult).toHaveBeenCalledTimes(1);
  });

  it('fails open on serialization exception without logging private data or calling the endpoint', async () => {
    const raw = {
      content: [],
      toJSON() {
        throw new Error('RAW_PRIVATE');
      },
    };
    expect(
      await finalizeMcpToolResult(
        'search_articles',
        raw,
        false,
        client,
        logger,
      ),
    ).toBe(raw);
    expect(client.evaluateMcpToolResult).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'MCP result gate failed open',
      { toolName: 'search_articles', category: 'adapter', contentLength: 0 },
    );
    expect(metricsCount).toHaveBeenCalledExactlyOnceWith(
      'agent.untrusted_content_gate.fail_open',
      1,
      { attributes: { category: 'adapter', origin: 'mcp' } },
    );
  });

  it('fails open on adapter rejection with sanitized warning and no retry', async () => {
    const raw = result('RAW_PRIVATE');
    const before = structuredClone(raw);
    client.evaluateMcpToolResult.mockRejectedValue(
      new Error('RAW_PRIVATE_BODY'),
    );
    expect(
      await finalizeMcpToolResult(
        'search_articles',
        raw,
        false,
        client,
        logger,
      ),
    ).toEqual(withCardResult('search_articles', before));
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      'MCP result gate failed open',
      {
        toolName: 'search_articles',
        category: 'adapter',
        contentLength: Buffer.byteLength(
          JSON.stringify(JSON.stringify(before)),
          'utf8',
        ),
      },
    );
    expect(client.evaluateMcpToolResult).toHaveBeenCalledTimes(1);
    expect(raw).toEqual(before);
    expect(metricsCount).toHaveBeenCalledExactlyOnceWith(
      'agent.untrusted_content_gate.fail_open',
      1,
      { attributes: { category: 'adapter', origin: 'mcp' } },
    );
  });

  it.each([0, 1])(
    'uses multibyte whole-result DTO JSON bytes at limit plus %s',
    async (over) => {
      const empty = { content: [{ type: 'text', text: '' }] };
      const room =
        MCP_TOOL_RESULT_MAX_JSON_BYTES -
        Buffer.byteLength(JSON.stringify(JSON.stringify(empty)), 'utf8');
      const text =
        'é'.repeat(Math.floor(room / 2)) + 'a'.repeat((room % 2) + over);
      const raw = { content: [{ type: 'text', text }] };
      expect(
        Buffer.byteLength(JSON.stringify(JSON.stringify(raw)), 'utf8'),
      ).toBe(MCP_TOOL_RESULT_MAX_JSON_BYTES + over);
      expect(
        await finalizeMcpToolResult(
          'search_articles',
          raw,
          false,
          client,
          logger,
        ),
      ).toBe(raw);
      if (over === 0) {
        expect(client.evaluateMcpToolResult).toHaveBeenCalledExactlyOnceWith(
          'search_articles',
          JSON.stringify(raw),
        );
        expect(logger.warn).not.toHaveBeenCalled();
      } else {
        // Oversize results are classified as a bounded, flagged sample so the
        // API decides by mode; they are never skipped (#5894).
        expect(client.evaluateMcpToolResult).toHaveBeenCalledExactlyOnceWith(
          'search_articles',
          expect.any(String),
          true,
        );
        const sample = client.evaluateMcpToolResult.mock.calls[0]?.[1] ?? '';
        expect(
          Buffer.byteLength(JSON.stringify(sample), 'utf8'),
        ).toBeLessThanOrEqual(MCP_TOOL_RESULT_MAX_JSON_BYTES);
        expect(logger.warn).not.toHaveBeenCalled();
        expect(metricsCount).not.toHaveBeenCalled();
      }
    },
  );

  it('withholds an oversize result when the gate withholds its sample (fail closed)', async () => {
    const raw = { content: [{ type: 'text', text: 'é'.repeat(700_000) }] };
    client.evaluateMcpToolResult.mockResolvedValue({
      content: 'withheld',
      outcome: 'withheld',
    });
    const final = await finalizeMcpToolResult(
      'search_articles',
      raw,
      false,
      client,
      logger,
    );
    expect(final).toEqual({
      content: [
        {
          type: 'text',
          text: 'tool result withheld: suspected instruction injection',
        },
      ],
      isError: true,
    });
    expect(client.evaluateMcpToolResult).toHaveBeenCalledExactlyOnceWith(
      'search_articles',
      expect.stringContaining('middle of oversize result omitted'),
      true,
    );
  });

  it('keeps card formatting failures outside the gate catch boundary', async () => {
    const raw: McpAppResult = { content: [] };
    Object.defineProperty(raw, 'structuredContent', {
      get() {
        throw new Error('card formatting failure');
      },
    });
    Object.defineProperty(raw, 'toJSON', { value: () => ({ content: [] }) });
    await expect(
      finalizeMcpToolResult('search_articles', raw, false, client, logger),
    ).rejects.toThrow('card formatting failure');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(client.evaluateMcpToolResult).toHaveBeenCalledTimes(1);
  });
});
