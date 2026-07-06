import { getToolByName } from '@genfeedai/tools';
import { LoggerService } from '@libs/logger/logger.service';
import { ClientService } from '@mcp/services/client.service';
import {
  bindGeneratedOperationRequest,
  getGeneratedOperationBinding,
} from '@mcp/services/generated-tool-dispatcher';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

function getGeneratedFixture(name: string) {
  const operation = getGeneratedOperationBinding(name);
  const tool = getToolByName(name);
  expect(operation).toBeDefined();
  expect(tool).toBeDefined();
  if (!operation || !tool) {
    throw new Error(`Missing generated fixture for ${name}`);
  }
  return { operation, tool };
}

function build() {
  const client = {
    attachApprovalResult: vi
      .fn()
      .mockResolvedValue({ id: 'apr-generated', status: 'APPROVED' }),
    createApproval: vi.fn().mockResolvedValue({
      id: 'apr-generated',
      status: 'PENDING',
      toolName: 'activities__update',
    }),
    requestGeneratedOperation: vi
      .fn()
      .mockResolvedValue({ data: [{ id: 'activity-1' }] }),
    resolveApproval: vi.fn().mockResolvedValue({
      arguments: { activityId: 'activity 1', isRead: true },
      id: 'apr-generated',
      status: 'APPROVED',
      toolName: 'activities__update',
    }),
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
    'superadmin',
  );
  return { client, registry };
}

describe('ToolRegistryService — generated OpenAPI dispatcher', () => {
  it('binds generated path, query, and body arguments into an API request', () => {
    const readFixture = getGeneratedFixture('activities__find_all');

    const readRequest = bindGeneratedOperationRequest(
      readFixture.operation,
      readFixture.tool,
      { limit: 5, page: 2, sort: 'createdAt: -1' },
    );

    expect(readRequest).toMatchObject({
      body: undefined,
      method: 'GET',
      path: '/activities',
      query: { limit: 5, page: 2, sort: 'createdAt: -1' },
    });

    const writeFixture = getGeneratedFixture('activities__update');

    const writeRequest = bindGeneratedOperationRequest(
      writeFixture.operation,
      writeFixture.tool,
      { activityId: 'activity 1', isRead: true },
    );

    expect(writeRequest).toMatchObject({
      body: { isRead: true },
      method: 'PATCH',
      path: '/activities/activity%201',
      query: {},
    });
  });

  it('executes generated GET tools directly through the generic API client', async () => {
    const { client, registry } = build();

    const result = (await registry.handleToolCall({
      arguments: { limit: 5, page: 2 },
      name: 'activities__find_all',
    })) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeFalsy();
    expect(client.createApproval).not.toHaveBeenCalled();
    expect(client.requestGeneratedOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/activities',
        query: { limit: 5, page: 2 },
      }),
    );
    expect(result.content[0].text).toContain('activity-1');
  });

  it('returns structured MCP errors for unknown generated args', async () => {
    const { client, registry } = build();

    const result = (await registry.handleToolCall({
      arguments: { definitelyNotAnArg: true },
      name: 'activities__find_all',
    })) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown argument');
    expect(client.requestGeneratedOperation).not.toHaveBeenCalled();
    expect(client.createApproval).not.toHaveBeenCalled();
  });

  it('routes generated mutating tools to approval after validating args', async () => {
    const { client, registry } = build();

    const result = (await registry.handleToolCall({
      arguments: { activityId: 'activity 1', isRead: true },
      name: 'activities__update',
    })) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeFalsy();
    expect(client.createApproval).toHaveBeenCalledWith('activities__update', {
      activityId: 'activity 1',
      isRead: true,
    });
    expect(client.requestGeneratedOperation).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('requires approval');
  });

  it('declines a generated write approval without executing the API request', async () => {
    const { client, registry } = build();

    const result = (await registry.handleToolCall({
      arguments: { approvalId: 'apr-generated', decision: 'decline' },
      name: 'resolve_approval',
    })) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeFalsy();
    expect(client.resolveApproval).toHaveBeenCalledWith(
      'apr-generated',
      'decline',
    );
    expect(client.requestGeneratedOperation).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('not executed');
  });

  it('approves a generated write by claiming first and executing it once', async () => {
    const { client, registry } = build();
    client.requestGeneratedOperation.mockResolvedValueOnce({
      data: { id: 'activity-1', isRead: true },
    });

    const result = (await registry.handleToolCall({
      arguments: { approvalId: 'apr-generated', decision: 'approve' },
      name: 'resolve_approval',
    })) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeFalsy();
    expect(client.resolveApproval).toHaveBeenCalledWith(
      'apr-generated',
      'approve',
    );
    expect(client.requestGeneratedOperation).toHaveBeenCalledTimes(1);
    expect(client.requestGeneratedOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { isRead: true },
        method: 'PATCH',
        path: '/activities/activity%201',
      }),
    );
    expect(client.createApproval).not.toHaveBeenCalled();
    expect(client.attachApprovalResult).toHaveBeenCalledWith(
      'apr-generated',
      expect.objectContaining({ content: expect.any(Array) }),
    );
  });

  it('does not execute a generated write when the approval claim fails', async () => {
    const { client, registry } = build();
    client.resolveApproval.mockRejectedValueOnce(
      new Error('Approval already resolved'),
    );

    const result = (await registry.handleToolCall({
      arguments: { approvalId: 'apr-generated', decision: 'approve' },
      name: 'resolve_approval',
    })) as { content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('already resolved');
    expect(client.requestGeneratedOperation).not.toHaveBeenCalled();
    expect(client.attachApprovalResult).not.toHaveBeenCalled();
  });
});
