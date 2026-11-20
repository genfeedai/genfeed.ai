import { getToolsForSurface, toMcpTools } from '@genfeedai/actions';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ClientService } from '@mcp/services/client.service';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

const ORGANIZATIONS = [
  { id: 'org-a', isActive: true, label: 'Acme', slug: 'acme' },
  { id: 'org-b', isActive: false, label: 'Beta', slug: 'beta' },
];

function build(canSwitchOrganizations: boolean) {
  let activeOrganization: string | null = null;
  const client = {
    canSwitchOrganizations: vi.fn().mockResolvedValue(canSwitchOrganizations),
    executeAgentTool: vi.fn(async () => ({
      creditsUsed: 0,
      data: { ok: true },
      success: true,
    })),
    isApprovalRequired: vi.fn().mockResolvedValue(false),
    listBrands: vi.fn(async () =>
      activeOrganization === 'org-b'
        ? [{ id: 'brand-b', label: 'Beta Studio' }]
        : [{ id: 'brand-a', label: 'Acme Main' }],
    ),
    listOrganizations: vi.fn().mockResolvedValue(ORGANIZATIONS),
    runInOrganization: vi.fn(
      async (organizationId: string, work: () => Promise<unknown>) => {
        activeOrganization = organizationId;
        try {
          return await work();
        } finally {
          activeOrganization = null;
        }
      },
    ),
  };
  const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const registry = new ToolRegistryService(
    client as unknown as ClientService,
    logger as unknown as LoggerService,
    'user',
    undefined,
    'standard',
    canSwitchOrganizations,
  );
  return { client, registry };
}

const GENERATE_TEXT = {
  arguments: {
    action: 'content',
    input: { brandId: 'brand-a', prompt: 'a launch post' },
  },
  name: 'generate_text',
};

describe('connection covering several organizations', () => {
  it('refuses a call that names no organization and lists every organization with its brands', async () => {
    const { client, registry } = build(true);

    const result = (await registry.handleToolCall(GENERATE_TEXT)) as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
    };

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: 'organization_required',
      organizations: [
        {
          brands: [{ id: 'brand-a', label: 'Acme Main' }],
          id: 'org-a',
          slug: 'acme',
        },
        {
          brands: [{ id: 'brand-b', label: 'Beta Studio' }],
          id: 'org-b',
          slug: 'beta',
        },
      ],
    });
    expect(JSON.stringify(result)).toContain('Beta Studio (brand-b)');
    expect(client.executeAgentTool).not.toHaveBeenCalled();
  });

  it('runs a call that names its organization inside that organization', async () => {
    const { client, registry } = build(true);

    const result = (await registry.handleToolCall({
      ...GENERATE_TEXT,
      arguments: { ...GENERATE_TEXT.arguments, organization: 'beta' },
    })) as { isError?: boolean };

    expect(result.isError).toBeFalsy();
    expect(client.runInOrganization).toHaveBeenCalledWith(
      'org-b',
      expect.any(Function),
    );
    expect(client.executeAgentTool).toHaveBeenCalledOnce();
  });

  it('names the organization and brand a call acted in, in the text and the structured result', async () => {
    const { registry } = build(true);

    const result = (await registry.handleToolCall({
      ...GENERATE_TEXT,
      arguments: {
        action: 'content',
        input: { brandId: 'brand-b', prompt: 'a launch post' },
        organization: 'beta',
      },
    })) as {
      content: { text: string }[];
      structuredContent?: Record<string, unknown>;
    };

    expect(result.structuredContent).toMatchObject({
      brand: { id: 'brand-b', label: 'Beta Studio' },
      organization: { id: 'org-b', label: 'Beta', slug: 'beta' },
    });
    expect(result.content.map((part) => part.text)).toContain(
      'Organization: Beta. Brand: Beta Studio.',
    );
  });

  it('marks the named organization active in an organizations listing', async () => {
    const { registry } = build(true);

    const result = (await registry.handleToolCall({
      arguments: { action: 'organizations', organization: 'beta' },
      name: 'get_context',
    })) as { structuredContent?: { data?: Record<string, unknown> } };

    expect(result.structuredContent?.data).toMatchObject({
      activeOrganizationId: 'org-b',
      organizations: [
        { id: 'org-a', isActive: false },
        { id: 'org-b', isActive: true },
      ],
    });
  });

  it.each([
    { arguments: { action: 'organizations' }, name: 'get_context' },
    { arguments: { action: 'account' }, name: 'get_context' },
    { arguments: {}, name: 'find_tools' },
  ])('lets $name $arguments through without an organization', async (call) => {
    const { registry } = build(true);

    const result = (await registry.handleToolCall(call)) as {
      structuredContent?: { code?: string };
    };

    expect(result.structuredContent?.code).not.toBe('organization_required');
  });

  it('reports the failure instead of guessing when the organizations cannot be listed', async () => {
    const { client, registry } = build(true);
    client.listOrganizations.mockRejectedValue(new Error('upstream down'));

    const result = (await registry.handleToolCall(GENERATE_TEXT)) as {
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(client.executeAgentTool).not.toHaveBeenCalled();
  });
});

describe('connection limited to one organization', () => {
  it('runs a call that names no organization, without listing organizations', async () => {
    const { client, registry } = build(false);

    const result = (await registry.handleToolCall(GENERATE_TEXT)) as {
      isError?: boolean;
    };

    expect(result.isError).toBeFalsy();
    expect(client.executeAgentTool).toHaveBeenCalledOnce();
    expect(client.listOrganizations).not.toHaveBeenCalled();
  });
});

describe('organization argument in the tool list', () => {
  it('is declared by every listed tool', () => {
    const tools = toMcpTools(getToolsForSurface('mcp'));

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(Object.keys(tool.inputSchema.properties), tool.name).toContain(
        'organization',
      );
    }
  });
});
