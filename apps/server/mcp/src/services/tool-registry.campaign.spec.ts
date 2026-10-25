import { DEFAULT_MCP_PROFILE_TOOLSETS } from '@genfeedai/actions';
import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { Test } from '@nestjs/testing';

async function setup() {
  const client = {
    manageCampaign: vi.fn().mockResolvedValue({
      id: 'campaign-1',
      brandId: 'brand-1',
      tone: 'Candid',
      assetIds: ['asset-1'],
    }),
    isApprovalRequired: vi.fn().mockResolvedValue(true),
    createApproval: vi
      .fn()
      .mockImplementation(
        async (toolName: string, args: Record<string, unknown>) => ({
          id: 'approval-1',
          status: 'PENDING',
          toolName,
          arguments: args,
        }),
      ),
    createScheduledRelease: vi
      .fn()
      .mockResolvedValue({ id: 'release-1', campaignId: 'campaign-1' }),
    updateScheduledRelease: vi
      .fn()
      .mockResolvedValue({ id: 'release-1', campaignId: 'campaign-1' }),
    claimApprovalExecution: vi.fn().mockResolvedValue(true),
    attachApprovalResult: vi.fn().mockResolvedValue({ id: 'approval-1' }),
    evaluateMcpToolResult: vi.fn().mockResolvedValue({ outcome: 'allowed' }),
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
    DEFAULT_MCP_PROFILE_TOOLSETS,
  );
  return { registry, client, module };
}

describe('native campaign registry journey', () => {
  it('advertises native campaign context and publishing readiness in the default connection', async () => {
    const { registry, module } = await setup();
    try {
      expect(registry.getTools().map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          'manage_campaign',
          'list_brand_publishing_readiness',
          'create_scheduled_release',
        ]),
      );
    } finally {
      await module.close();
    }
  });

  it('executes context creation directly through the real catalog without publishing', async () => {
    const { registry, client, module } = await setup();
    const args = {
      action: 'create',
      input: {
        brandId: 'brand-1',
        name: 'Launch',
        idempotencyKey: 'launch-1',
        tone: 'Candid',
        audience: 'Small teams',
        assetIds: ['asset-1'],
      },
    };
    try {
      const result = await registry.handleToolCall({
        name: 'manage_campaign',
        arguments: args,
      });
      expect(result).toMatchObject({
        structuredContent: {
          data: {
            id: 'campaign-1',
            brandId: 'brand-1',
            assetIds: ['asset-1'],
          },
        },
      });
      expect(client.manageCampaign).toHaveBeenCalledWith(args);
      expect(client.createApproval).not.toHaveBeenCalled();
      expect(client.createScheduledRelease).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });

  it('rejects lifecycle and missing-brand input before any context or publishing mutation', async () => {
    const { registry, client, module } = await setup();
    try {
      for (const args of [
        {
          action: 'publish',
          input: { brandId: 'brand-1', campaignId: 'campaign-1' },
        },
        {
          action: 'create',
          input: { name: 'Launch', idempotencyKey: 'launch-1' },
        },
        {
          action: 'update',
          input: {
            brandId: 'brand-1',
            campaignId: 'campaign-1',
            status: 'active',
          },
        },
      ]) {
        expect(
          await registry.handleToolCall({
            name: 'manage_campaign',
            arguments: args,
          }),
        ).toMatchObject({ isError: true });
      }
      expect(client.manageCampaign).not.toHaveBeenCalled();
      expect(client.createApproval).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });

  it('keeps the campaign link in the pending publishing approval without dispatching a release', async () => {
    const { registry, client, module } = await setup();
    const args = {
      idempotencyKey: 'launch-release-1',
      release: {
        brandId: 'brand-1',
        campaignId: 'campaign-1',
        title: 'Launch',
        baseContent: 'Live launch',
        status: 'scheduled',
        timezone: 'Europe/Malta',
        scheduledDate: '2026-10-27T14:30:00+01:00',
        targets: [{ credentialId: 'credential-1', platform: 'twitter' }],
      },
    };
    try {
      const result = await registry.handleToolCall({
        name: 'create_scheduled_release',
        arguments: args,
      });
      expect(JSON.stringify(result)).toContain('approval-1');
      expect(client.createApproval).toHaveBeenCalledWith(
        'create_scheduled_release',
        args,
      );
      expect(client.createScheduledRelease).not.toHaveBeenCalled();
      expect(client.manageCampaign).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });

  it('forwards campaign identity and idempotency after the server returns an approved release action', async () => {
    const { registry, client, module } = await setup();
    const args = {
      idempotencyKey: 'launch-release-1',
      release: {
        brandId: 'brand-1',
        campaignId: 'campaign-1',
        title: 'Launch',
        baseContent: 'Live launch',
        status: 'scheduled',
        timezone: 'Europe/Malta',
        scheduledDate: '2026-10-27T14:30:00+01:00',
        targets: [{ credentialId: 'credential-1', platform: 'twitter' }],
      },
    };
    client.createApproval.mockResolvedValue({
      id: 'approval-1',
      status: 'APPROVED',
      toolName: 'create_scheduled_release',
      arguments: args,
    });
    try {
      const result = await registry.handleToolCall({
        name: 'create_scheduled_release',
        arguments: args,
      });
      expect(result).toMatchObject({
        structuredContent: {
          data: { id: 'release-1', campaignId: 'campaign-1' },
        },
      });
      expect(client.claimApprovalExecution).toHaveBeenCalledWith('approval-1');
      expect(client.createScheduledRelease).toHaveBeenCalledWith(
        args.release,
        'launch-release-1',
      );
      expect(client.attachApprovalResult).toHaveBeenCalledWith(
        'approval-1',
        expect.anything(),
      );
    } finally {
      await module.close();
    }
  });
});
