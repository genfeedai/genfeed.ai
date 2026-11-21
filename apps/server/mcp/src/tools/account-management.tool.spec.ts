import type { McpMediaContentPart } from '@genfeedai/contracts/interfaces';
import type { ClientService } from '@mcp/services/client.service';
import { handleAccountManagementTool } from '@mcp/tools/account-management.tool';

function textOf(part: McpMediaContentPart | undefined): string {
  if (part?.type !== 'text') {
    throw new Error('expected a text content part');
  }
  return part.text;
}

function organization(id: string, label: string, isActive: boolean) {
  return {
    brand: null,
    id,
    isActive,
    isOwner: true,
    label,
    logoUrl: null,
    slug: label.toLowerCase(),
  };
}

function buildClient() {
  return {
    canSwitchOrganizations: vi.fn().mockResolvedValue(false),
    getJobStatus: vi
      .fn()
      .mockResolvedValue({ id: 'job-1', status: 'COMPLETED' }),
    listBrands: vi
      .fn()
      .mockResolvedValue([{ id: 'brand-a', label: 'Acme Main' }]),
    listOrganizations: vi
      .fn()
      .mockResolvedValue([
        organization('org-a', 'Acme', true),
        organization('org-b', 'Beta', false),
        organization('org-c', 'Gamma', false),
      ]),
    // Stands in for "run this listing inside that organization".
    runInOrganization: vi.fn(async (organizationId: string) => {
      const brandsByOrganization: Record<string, unknown> = {
        'org-a': [{ id: 'brand-a', label: 'Acme Main' }],
        'org-b': [{ id: 'brand-b', label: 'Beta Studio' }],
      };
      return brandsByOrganization[organizationId] ?? [];
    }),
  };
}

function call(
  client: ReturnType<typeof buildClient>,
  name: string,
  args: Record<string, unknown>,
) {
  return handleAccountManagementTool(
    client as unknown as ClientService,
    name,
    args,
  );
}

describe('handleAccountManagementTool', () => {
  it('reports the job status for a job id', async () => {
    const client = buildClient();

    const result = await call(client, 'get_job_status', { jobId: 'job-1' });

    expect(client.getJobStatus).toHaveBeenCalledWith('job-1');
    expect(textOf(result.content[0])).toContain('Job Status');
    expect(textOf(result.content[0])).toContain('Completed');
  });

  it('lists every organization and marks the one the connection is bound to', async () => {
    const client = buildClient();

    const result = await call(client, 'get_orgs', {});

    expect(client.listOrganizations).toHaveBeenCalledTimes(1);
    expect(result.structuredContent?.data).toMatchObject({
      activeOrganizationId: 'org-a',
      organizations: [
        expect.objectContaining({ id: 'org-a', isActive: true }),
        expect.objectContaining({ id: 'org-b', isActive: false }),
        expect.objectContaining({ id: 'org-c', isActive: false }),
      ],
    });
    const text = textOf(result.content[0]);
    expect(text).toContain('This connection works inside "Acme"');
    expect(text).toContain('reconnect');
    expect(text).toContain('Beta');
    expect(text).toContain('Gamma');
    expect(text).not.toContain('org-b');
    expect(result.structuredContent?.data).toMatchObject({
      brands: [{ id: 'brand-a', label: 'Acme Main' }],
      canSwitchOrganizations: false,
    });
  });

  it('tells an all-organizations connection to name the organization on every call', async () => {
    const client = buildClient();
    client.canSwitchOrganizations.mockResolvedValue(true);

    const result = await call(client, 'get_orgs', {});

    const text = textOf(result.content[0]);
    expect(text).toContain('must name the organization it acts in');
    expect(text).not.toContain('reconnect');
    expect(result.structuredContent?.data).toMatchObject({
      canSwitchOrganizations: true,
    });
  });

  it('still lists organizations when the switching check or brand list fails', async () => {
    const client = buildClient();
    client.canSwitchOrganizations.mockRejectedValue(new Error('boom'));
    client.listBrands.mockRejectedValue(new Error('boom'));

    const result = await call(client, 'get_orgs', {});

    expect(result.structuredContent?.data).toMatchObject({
      brands: [],
      canSwitchOrganizations: false,
    });
    expect(textOf(result.content[0])).toContain('Beta');
  });

  it('lists every organization with its own brands when the connection may use them all', async () => {
    const client = buildClient();
    client.canSwitchOrganizations.mockResolvedValue(true);

    const result = await call(client, 'get_orgs', {});

    expect(result.structuredContent?.data).toMatchObject({
      canSwitchOrganizations: true,
      organizations: [
        { brands: [{ id: 'brand-a', label: 'Acme Main' }], id: 'org-a' },
        { brands: [{ id: 'brand-b', label: 'Beta Studio' }], id: 'org-b' },
        { brands: [], id: 'org-c' },
      ],
    });
    expect(textOf(result.content[0])).toContain('all of your organizations');
  });

  it('keeps a one-organization connection to its own brands', async () => {
    const client = buildClient();

    const result = await call(client, 'get_orgs', {});

    expect(client.runInOrganization).not.toHaveBeenCalled();
    expect(textOf(result.content[0])).not.toContain('brandId');
  });

  it('omits the reconnect guidance for a single organization', async () => {
    const client = buildClient();
    client.listOrganizations.mockResolvedValue([
      organization('org-a', 'Acme', true),
    ]);

    const result = await call(client, 'get_orgs', {});

    expect(textOf(result.content[0])).not.toContain('reconnect');
  });

  it('reports no active organization when none is flagged', async () => {
    const client = buildClient();
    client.listOrganizations.mockResolvedValue([
      organization('org-a', 'Acme', false),
      organization('org-b', 'Beta', false),
    ]);

    const result = await call(client, 'get_orgs', {});

    expect(result.structuredContent?.data).not.toHaveProperty(
      'activeOrganizationId',
    );
    expect(textOf(result.content[0])).toContain('one organization');
  });

  it('rejects an unknown account management tool name', () => {
    const client = buildClient();

    expect(() => call(client, 'delete_account', {})).toThrow(
      /Unknown account management tool: delete_account/,
    );
  });

  it.each(['get_account_info', 'list_brands', 'get_brand'])(
    'no longer handles the merged %s tool',
    (name) => {
      expect(() => call(buildClient(), name, {})).toThrow(
        /Unknown account management tool/,
      );
    },
  );
});
