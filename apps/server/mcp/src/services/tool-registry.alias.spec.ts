import { ALL_TOOLS, getMcpCatalogOperations } from '@genfeedai/actions';
import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { Test } from '@nestjs/testing';

const state = vi.hoisted(() => ({ deniedName: '' }));
vi.mock('@genfeedai/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/actions')>();
  return {
    ...actual,
    getToolByName: (name: string) => {
      const tool = actual.getToolByName(name);
      return tool && name === state.deniedName
        ? { ...tool, requiredRole: 'admin' as const }
        : tool;
    },
  };
});
beforeEach(() => {
  state.deniedName = '';
});
const operations = ['check_channel', 'upload_media'].flatMap(
  getMcpCatalogOperations,
);
async function build(mode: 'standard' | 'claude' = 'standard') {
  const client = {
    listSchedulerCapabilities: vi
      .fn()
      .mockResolvedValue([{ platform: 'youtube' }]),
    getSchedulerCapability: vi.fn().mockResolvedValue({ platform: 'youtube' }),
    validateSchedulerTarget: vi.fn().mockResolvedValue({
      validationState: 'valid',
      errors: [],
      warnings: [],
    }),
    executeAgentTool: vi
      .fn()
      .mockResolvedValue({ success: true, data: { assetId: 'asset' } }),
    evaluateMcpToolResult: vi.fn().mockResolvedValue({ outcome: 'allowed' }),
    isApprovalRequired: vi.fn().mockResolvedValue(true),
    createApproval: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const module = await Test.createTestingModule({
    providers: [
      { provide: ClientService, useValue: client },
      { provide: LoggerService, useValue: logger },
    ],
  }).compile();
  const registry = new ToolRegistryService(
    module.get(ClientService),
    module.get(LoggerService),
    'user',
    ['core'],
    undefined,
    mode,
  );
  return { registry, client, logger, module };
}
const inputs: Record<string, Record<string, unknown>> = {
  capabilities: { includeHidden: true, includePlanned: false },
  validate: {
    platform: 'youtube',
    caption: 'draft',
    media: [{ kind: 'video', id: 'asset' }],
    settings: { nested: [true, null] },
  },
  request: { filename: 'photo.png', contentType: 'image/png' },
  complete: { assetId: 'asset' },
};

describe('canonical MCP dispatch and immediate retirement', () => {
  it.each(operations)(
    'rejects retired $executionName immediately without effects',
    async (operation) => {
      const { registry, client, module } = await build();
      try {
        const result = await registry.handleToolCall({
          name: operation.executionName,
          arguments: inputs[operation.action],
        });
        expect(result).toMatchObject({ isError: true });
        expect(JSON.stringify(result)).toContain(
          `${operation.canonicalName}(action=${operation.action})`,
        );
        for (const method of Object.values(client))
          expect(method).not.toHaveBeenCalled();
      } finally {
        await module.close();
      }
    },
  );

  it.each(operations)(
    'executes $canonicalName $action exactly as $executionName',
    async (operation) => {
      const { registry, client, logger, module } = await build();
      try {
        const args = inputs[operation.action];
        const canonical = await registry.handleToolCall({
          name: operation.canonicalName,
          arguments: { action: operation.action, input: args },
        });
        const methods = [
          client.listSchedulerCapabilities,
          client.getSchedulerCapability,
          client.validateSchedulerTarget,
          client.executeAgentTool,
        ];
        expect(canonical).not.toMatchObject({ isError: true });
        expect(logger.warn).not.toHaveBeenCalled();
        expect(
          methods.reduce(
            (count, method) => count + method.mock.calls.length,
            0,
          ),
        ).toBe(1);
        expect(client.createApproval).not.toHaveBeenCalled();
        if (operation.canonicalName === 'upload_media') {
          expect(client.executeAgentTool).toHaveBeenCalledExactlyOnceWith(
            operation.executionName,
            args,
            undefined,
          );
          expect(client.evaluateMcpToolResult).not.toHaveBeenCalled();
        }
      } finally {
        await module.close();
      }
    },
  );

  it('preserves native completion output and credits without fetching media or adding a result gate', async () => {
    const { registry, client, module } = await build();
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Network forbidden in this test'));
    try {
      client.executeAgentTool.mockResolvedValue({
        success: true,
        creditsUsed: 0,
        data: {
          id: 'asset',
          category: 'VIDEO',
          status: 'COMPLETED',
          url: 'https://cdn.genfeed.ai/fixture.mp4',
        },
      });
      const canonical = await registry.handleToolCall({
        name: 'upload_media',
        arguments: { action: 'complete', input: inputs.complete },
      });
      expect(canonical).toMatchObject({
        structuredContent: { artifact: { kind: 'video' }, creditsDebited: 0 },
      });
      expect(client.executeAgentTool).toHaveBeenCalledTimes(1);
      expect(client.evaluateMcpToolResult).not.toHaveBeenCalled();
      expect(client.createApproval).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      fetcher.mockRestore();
      await module.close();
    }
  });

  it.each(operations)(
    'preserves original API rejection/error output for $action',
    async (operation) => {
      const { registry, client, module } = await build();
      try {
        for (const method of [
          client.listSchedulerCapabilities,
          client.validateSchedulerTarget,
          client.executeAgentTool,
        ])
          method.mockRejectedValue(new Error('Original API denied operation'));
        const canonical = await registry.handleToolCall({
          name: operation.canonicalName,
          arguments: {
            action: operation.action,
            input: inputs[operation.action],
          },
        });
        expect(canonical).toMatchObject({ isError: true });
        expect(JSON.stringify(canonical)).toContain(
          'Original API denied operation',
        );
        expect(client.createApproval).not.toHaveBeenCalled();
        expect(client.evaluateMcpToolResult).not.toHaveBeenCalled();
      } finally {
        await module.close();
      }
    },
  );

  it('keeps fixed canonical action despite an inner action and permits calls outside listed toolsets', async () => {
    const { registry, client, module } = await build();
    try {
      expect(registry.getTools().map((tool) => tool.name)).not.toContain(
        'check_channel',
      );
      await registry.handleToolCall({
        name: 'check_channel',
        arguments: { action: 'capabilities', input: { action: 'validate' } },
      });
      expect(client.listSchedulerCapabilities).toHaveBeenCalledTimes(1);
      expect(client.validateSchedulerTarget).not.toHaveBeenCalled();
      await registry.handleToolCall({
        name: 'upload_media',
        arguments: {
          action: 'request',
          input: { ...inputs.request, action: 'complete' },
        },
      });
      expect(client.executeAgentTool).toHaveBeenCalledWith(
        'request_media_upload',
        { ...inputs.request, action: 'complete' },
        undefined,
      );
    } finally {
      await module.close();
    }
  });

  it('retains original scheduler validation errors without client work', async () => {
    const { registry, client, module } = await build();
    try {
      for (const [action, args] of [
        ['capabilities', { platform: 'youtube', includeHidden: true }],
        ['validate', {}],
        ['validate', { platform: 'youtube', media: {} }],
        ['validate', { platform: 'youtube', settings: [] }],
      ] as const) {
        const operation = operations.find(
          (candidate) => candidate.action === action,
        );
        if (!operation) throw new Error('Missing operation');
        const canonical = await registry.handleToolCall({
          name: operation.canonicalName,
          arguments: { action, input: args },
        });
        expect(canonical).toMatchObject({ isError: true });
      }
      expect(client.listSchedulerCapabilities).not.toHaveBeenCalled();
      expect(client.validateSchedulerTarget).not.toHaveBeenCalled();
      expect(client.createApproval).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });

  it('rejects strict envelopes before handlers or approvals', async () => {
    const { registry, client, logger, module } = await build();
    try {
      for (const arguments_ of [
        { action: 'request' },
        { action: 'complete', input: null },
        { action: 'request', input: [], extra: true },
        { action: 'unknown', input: {} },
      ]) {
        expect(
          await registry.handleToolCall({
            name: 'upload_media',
            arguments: arguments_,
          }),
        ).toMatchObject({ isError: true });
      }
      expect(client.executeAgentTool).not.toHaveBeenCalled();
      expect(client.createApproval).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });

  it.each(['upload_media', 'request_media_upload', 'complete_media_upload'])(
    'does not grant Claude upload access through %s',
    async (name) => {
      const { registry, client, logger, module } = await build('claude');
      try {
        expect(
          await registry.handleToolCall({
            name,
            arguments: { action: 'request', input: inputs.request },
          }),
        ).toMatchObject({ isError: true });
        expect(client.executeAgentTool).not.toHaveBeenCalled();
        expect(client.createApproval).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
      } finally {
        await module.close();
      }
    },
  );

  it('rejects authorized retired names before work and keeps denied names nonrevealing', async () => {
    for (const mode of ['standard', 'claude'] as const) {
      const { registry, client, logger, module } = await build(mode);
      try {
        for (const operation of operations) {
          const result = await registry.handleToolCall({
            name: operation.executionName,
            arguments: inputs[operation.action],
          });
          expect(result).toMatchObject({ isError: true });
          if (mode === 'claude' && operation.canonicalName === 'upload_media') {
            expect(JSON.stringify(result)).not.toContain(
              'upload_media(action=',
            );
          } else {
            expect(JSON.stringify(result)).toContain(
              `${operation.canonicalName}(action=${operation.action})`,
            );
          }
        }
        expect(client.executeAgentTool).not.toHaveBeenCalled();
        expect(client.listSchedulerCapabilities).not.toHaveBeenCalled();
        expect(client.validateSchedulerTarget).not.toHaveBeenCalled();
        expect(client.createApproval).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
      } finally {
        await module.close();
      }
    }
  });

  it.each(operations)(
    'checks requested, canonical and original role authority for $action before client work',
    async (operation) => {
      const { registry, client, logger, module } = await build();
      try {
        for (const deniedName of [
          operation.canonicalName,
          operation.executionName,
        ]) {
          state.deniedName = deniedName;
          for (const name of [
            operation.canonicalName,
            operation.executionName,
          ]) {
            const rejected = await registry.handleToolCall({
              name,
              arguments:
                name === operation.canonicalName
                  ? {
                      action: operation.action,
                      input: inputs[operation.action],
                    }
                  : inputs[operation.action],
            });
            expect(rejected).toMatchObject({ isError: true });
            expect(JSON.stringify(rejected)).not.toContain(
              `${operation.canonicalName}(action=${operation.action})`,
            );
          }
        }
        expect(client.executeAgentTool).not.toHaveBeenCalled();
        expect(client.listSchedulerCapabilities).not.toHaveBeenCalled();
        expect(client.validateSchedulerTarget).not.toHaveBeenCalled();
        expect(client.createApproval).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
      } finally {
        await module.close();
      }
    },
  );

  it('boots with all 150 raw definitions covered and advertises 30 Claude tools', async () => {
    expect(ALL_TOOLS.filter((tool) => tool.surfaces.mcp)).toHaveLength(151);
    expect(() => ToolRegistryService.validateDispatchCoverage()).not.toThrow();
    const { registry, module } = await build('claude');
    try {
      expect(registry.getAllTools()).toHaveLength(30);
      for (const name of [
        'get_scheduler_capabilities',
        'validate_scheduler_target',
      ]) {
        expect(
          await registry.handleToolCall({
            name,
            arguments:
              inputs[
                name === 'get_scheduler_capabilities'
                  ? 'capabilities'
                  : 'validate'
              ],
          }),
        ).toMatchObject({ isError: true });
      }
    } finally {
      await module.close();
    }
  });
});
