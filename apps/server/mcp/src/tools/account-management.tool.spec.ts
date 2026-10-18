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
    switchOrganization: vi.fn().mockResolvedValue(undefined),
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

    const result = await call(client, 'list_orgs', {});

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

  it('points at switch_org when switching is on', async () => {
    const client = buildClient();
    client.canSwitchOrganizations.mockResolvedValue(true);

    const result = await call(client, 'list_orgs', {});

    const text = textOf(result.content[0]);
    expect(text).toContain('Use switch_org');
    expect(text).not.toContain('reconnect');
    expect(result.structuredContent?.data).toMatchObject({
      canSwitchOrganizations: true,
    });
  });

  it('still lists organizations when the switching check or brand list fails', async () => {
    const client = buildClient();
    client.canSwitchOrganizations.mockRejectedValue(new Error('boom'));
    client.listBrands.mockRejectedValue(new Error('boom'));

    const result = await call(client, 'list_orgs', {});

    expect(result.structuredContent?.data).toMatchObject({
      brands: [],
      canSwitchOrganizations: false,
    });
    expect(textOf(result.content[0])).toContain('Beta');
  });

  it('switches organization and reports the refreshed listing', async () => {
    const client = buildClient();
    client.canSwitchOrganizations.mockResolvedValue(true);
    client.listOrganizations.mockResolvedValue([
      organization('org-a', 'Acme', false),
      organization('org-b', 'Beta', true),
    ]);

    const result = await call(client, 'switch_org', { organization: ' Beta ' });

    expect(client.switchOrganization).toHaveBeenCalledWith('org-b');
    expect(textOf(result.content[0])).toContain('Switched organization.');
    expect(result.structuredContent?.data).toMatchObject({
      activeOrganizationId: 'org-b',
    });
  });

  it('refuses to switch when the connection was approved without switching', async () => {
    const client = buildClient();

    await expect(
      call(client, 'switch_org', { organization: 'org-b' }),
    ).rejects.toThrow(/without organization switching/);
    expect(client.switchOrganization).not.toHaveBeenCalled();
  });

  it('requires an organization to switch', async () => {
    const client = buildClient();

    await expect(call(client, 'switch_org', {})).rejects.toThrow(
      /organization is required/,
    );
    expect(client.switchOrganization).not.toHaveBeenCalled();
  });

  it('rejects an organization the user does not belong to', async () => {
    const client = buildClient();
    client.canSwitchOrganizations.mockResolvedValue(true);

    await expect(
      call(client, 'switch_org', { organization: 'Nowhere' }),
    ).rejects.toThrow(/No organization matches "Nowhere"/);
    expect(client.switchOrganization).not.toHaveBeenCalled();
  });

  it('asks for the id when two organizations share a name', async () => {
    const client = buildClient();
    client.canSwitchOrganizations.mockResolvedValue(true);
    client.listOrganizations.mockResolvedValue([
      organization('org-a', 'Acme', true),
      organization('org-b', 'Acme', false),
    ]);

    await expect(
      call(client, 'switch_org', { organization: 'acme' }),
    ).rejects.toThrow(/More than one organization matches/);
    expect(client.switchOrganization).not.toHaveBeenCalled();
  });

  it('omits the reconnect guidance for a single organization', async () => {
    const client = buildClient();
    client.listOrganizations.mockResolvedValue([
      organization('org-a', 'Acme', true),
    ]);

    const result = await call(client, 'list_orgs', {});

    expect(textOf(result.content[0])).not.toContain('reconnect');
  });

  it('reports no active organization when none is flagged', async () => {
    const client = buildClient();
    client.listOrganizations.mockResolvedValue([
      organization('org-a', 'Acme', false),
      organization('org-b', 'Beta', false),
    ]);

    const result = await call(client, 'list_orgs', {});

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
