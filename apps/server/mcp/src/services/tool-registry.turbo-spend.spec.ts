import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * #7180: a Turbo run can cost thousands of credits, so an MCP call must stop at
 * a quote and wait for approval. Runs against the real catalog and pricing.
 */
function build() {
  const client = {
    createApproval: vi.fn().mockResolvedValue({
      id: 'apr-turbo',
      status: 'PENDING',
      toolName: 'generate_turbo_content',
    }),
    executeAgentTool: vi.fn(),
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
    'user',
  );
  return { client, registry };
}

describe('generate_turbo_content spend confirmation (#7180)', () => {
  it('queues the run with a credit quote and spends nothing', async () => {
    const { client, registry } = build();

    const result = await registry.handleToolCall({
      arguments: {
        brandId: 'brand-1',
        contentMix: { imagePercent: 0, videoPercent: 100 },
        count: 100,
        platforms: ['instagram'],
      },
      name: 'generate_turbo_content',
    });

    expect(client.createApproval).toHaveBeenCalledWith(
      'generate_turbo_content',
      expect.objectContaining({ brandId: 'brand-1', count: 100 }),
    );
    expect(client.executeAgentTool).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        approvalId: 'apr-turbo',
        code: 'approval_pending',
        toolName: 'generate_turbo_content',
      },
    });
    const quote = (
      result as { structuredContent: { estimatedCredits?: number } }
    ).structuredContent.estimatedCredits;
    expect(quote).toBeGreaterThan(100);
    expect(JSON.stringify(result)).toContain('Estimated cost');
  });

  it('tells the caller about the confirmation before the first call', () => {
    const { registry } = build();
    const tool = registry
      .getAllTools()
      .find((candidate) => candidate.name === 'generate_turbo_content');

    expect(tool?.description).toMatch(/requires approval/i);
    expect(tool?.description).toMatch(/estimate/i);
  });
});
