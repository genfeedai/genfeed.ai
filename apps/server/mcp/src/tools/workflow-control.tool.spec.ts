import type { ClientService } from '@mcp/services/client.service';
import { handleWorkflowControlTool } from '@mcp/tools/workflow-control.tool';

function buildClient() {
  return {
    installSystemWorkflow: vi
      .fn()
      .mockResolvedValue({ id: 'workflow-1', name: 'Daily Trends Digest' }),
    listSystemWorkflowCatalog: vi
      .fn()
      .mockResolvedValue([
        { canonicalId: 'daily-trends-digest', installed: false },
      ]),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleWorkflowControlTool(
    client as unknown as ClientService,
    name,
    args,
  );
}

describe('handleWorkflowControlTool system workflow catalog', () => {
  it('lists the catalog with installable-only defaults', async () => {
    const client = buildClient();

    const result = await call(client, 'list_system_workflow_catalog', {});

    expect(client.listSystemWorkflowCatalog).toHaveBeenCalledWith({
      family: undefined,
      includeNonInstallable: false,
      installedOnly: false,
    });
    expect(result.content[0].text).toContain('daily-trends-digest');
  });

  it('forwards catalog filters', async () => {
    const client = buildClient();

    await call(client, 'list_system_workflow_catalog', {
      family: 'reply-polling',
      includeNonInstallable: true,
      installedOnly: true,
    });

    expect(client.listSystemWorkflowCatalog).toHaveBeenCalledWith({
      family: 'reply-polling',
      includeNonInstallable: true,
      installedOnly: true,
    });
  });

  it('installs a catalog entry with an optional brand', async () => {
    const client = buildClient();

    const result = await call(client, 'install_system_workflow', {
      brandId: 'brand-1',
      canonicalId: 'daily-trends-digest',
    });

    expect(client.installSystemWorkflow).toHaveBeenCalledWith({
      brandId: 'brand-1',
      canonicalId: 'daily-trends-digest',
    });
    expect(result.content[0].text).toContain('workflow-1');
  });

  it('rejects an install without a canonicalId', async () => {
    const client = buildClient();

    await expect(call(client, 'install_system_workflow', {})).rejects.toThrow(
      /canonicalId required/,
    );
    expect(client.installSystemWorkflow).not.toHaveBeenCalled();
  });

  it('rejects an unknown tool name', () => {
    const client = buildClient();
    expect(() => call(client, 'not_a_workflow_tool', {})).toThrow(
      /Unknown workflow control tool/,
    );
  });
});
