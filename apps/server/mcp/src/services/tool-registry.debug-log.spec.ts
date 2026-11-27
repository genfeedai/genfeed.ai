import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { withMergedToolCalls } from '@mcp/services/tool-registry.endpoints.testing';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

describe('the debug line of a tool call', () => {
  it('names the tool and the argument keys, and carries no argument value', async () => {
    const client = {
      executeAgentTool: vi
        .fn()
        .mockResolvedValue({ success: true, creditsUsed: 0, data: {} }),
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

    await registry.handleToolCall({
      name: 'get_generation_options',
      arguments: {
        brandId: 'brand-secret-123',
        prompt: 'a prompt that must not be logged',
      },
    });

    const line = logger.debug.mock.calls.find(([message]) =>
      String(message).startsWith('Handling tool call: '),
    );
    // The merged-tool wrapper wraps the legacy arguments as `action` + `input`.
    expect(line?.[1]).toEqual({ argumentKeys: ['action', 'input'] });
    const everyDebugLine = JSON.stringify(logger.debug.mock.calls);
    expect(everyDebugLine).not.toContain('brand-secret-123');
    expect(everyDebugLine).not.toContain('must not be logged');
  });
});
