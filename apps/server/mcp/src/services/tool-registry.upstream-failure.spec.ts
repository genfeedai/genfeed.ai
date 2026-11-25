import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { withMergedToolCalls } from '@mcp/services/tool-registry.endpoints.testing';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { McpUpstreamError } from '@mcp/tools/mcp-tool-error';

function build(failure: unknown) {
  const client = {
    executeAgentTool: vi.fn().mockRejectedValue(failure),
    isApprovalRequired: vi.fn().mockResolvedValue(false),
  };
  const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const registry = withMergedToolCalls(
    new ToolRegistryService(
      client as unknown as ClientService,
      logger as unknown as LoggerService,
      'user',
      undefined,
      'standard',
    ),
  );
  return { logger, registry };
}

function upstream500(report?: { causeCode?: string; invocationId: string }) {
  const error = new McpUpstreamError('Failed to execute get_brands', {
    status: 500,
  });
  error.report = report;
  return error;
}

describe('a tool call whose upstream request failed', () => {
  it('logs the follow-up as a warning with the id the API client reported, not a second fault', async () => {
    const { logger, registry } = build(
      upstream500({
        causeCode: 'PROVIDER_UNAVAILABLE',
        invocationId: 'call-1',
      }),
    );

    await registry.handleToolCall({ arguments: {}, name: 'get_brands' });

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Tool call get_brands failed upstream:',
      {
        causeCode: 'PROVIDER_UNAVAILABLE',
        invocationId: 'call-1',
        status: 500,
      },
    );
  });

  it('keeps a failure nobody reported an error', async () => {
    const { logger, registry } = build(upstream500());

    await registry.handleToolCall({ arguments: {}, name: 'get_brands' });

    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('tells the caller the sanitized cause code beside the failure', async () => {
    const { registry } = build(
      upstream500({
        causeCode: 'PROVIDER_UNAVAILABLE',
        invocationId: 'call-1',
      }),
    );

    const result = await registry.handleToolCall({
      arguments: {},
      name: 'get_brands',
    });

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        failure: { causeCode: 'PROVIDER_UNAVAILABLE' },
      },
    });
  });
});
