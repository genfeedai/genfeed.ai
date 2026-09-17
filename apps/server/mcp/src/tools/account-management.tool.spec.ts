import type { McpMediaContentPart } from '@genfeedai/contracts/interfaces';
import type { ClientService } from '@mcp/services/client.service';
import { handleAccountManagementTool } from '@mcp/tools/account-management.tool';

function textOf(part: McpMediaContentPart | undefined): string {
  if (part?.type !== 'text') {
    throw new Error('expected a text content part');
  }
  return part.text;
}

function buildClient() {
  return {
    getAccountInfo: vi
      .fn()
      .mockResolvedValue({ email: 'owner@example.com', id: 'user-1' }),
    getJobStatus: vi
      .fn()
      .mockResolvedValue({ id: 'job-1', status: 'COMPLETED' }),
    listBrands: vi.fn().mockResolvedValue([
      { id: 'brand-1', name: 'Genfeed' },
      { id: 'brand-2', name: 'Second' },
    ]),
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
  it('returns the account info', async () => {
    const client = buildClient();

    const result = await call(client, 'get_account_info', {});

    expect(client.getAccountInfo).toHaveBeenCalled();
    expect(textOf(result.content[0])).toContain('Account Info');
    expect(textOf(result.content[0])).toContain('owner@example.com');
  });

  it('reports the job status for a job id', async () => {
    const client = buildClient();

    const result = await call(client, 'get_job_status', { jobId: 'job-1' });

    expect(client.getJobStatus).toHaveBeenCalledWith('job-1');
    expect(textOf(result.content[0])).toContain('Job Status');
    expect(textOf(result.content[0])).toContain('COMPLETED');
  });

  it('lists every brand', async () => {
    const client = buildClient();

    const result = await call(client, 'list_brands', {});

    expect(textOf(result.content[0])).toContain('Found 2 brands');
    expect(textOf(result.content[0])).toContain('brand-2');
  });

  it('reports an empty brand list', async () => {
    const client = buildClient();
    client.listBrands.mockResolvedValue([]);

    const result = await call(client, 'list_brands', {});

    expect(textOf(result.content[0])).toBe('No brands found.');
  });

  it('treats a non-array brand payload as an empty list', async () => {
    const client = buildClient();
    client.listBrands.mockResolvedValue({ id: 'brand-1' });

    const result = await call(client, 'list_brands', {});

    expect(textOf(result.content[0])).toBe('No brands found.');
  });

  it('asks for an explicit brand when more than one exists', async () => {
    const client = buildClient();

    const result = await call(client, 'get_brand', {});

    expect(textOf(result.content[0])).toContain('Select a brand');
    expect(textOf(result.content[0])).toContain('brand-1');
    expect(textOf(result.content[0])).toContain('brand-2');
  });

  it('returns the requested brand rather than the first organization brand', async () => {
    const client = buildClient();

    const result = await call(client, 'get_brand', { brandId: 'brand-2' });

    expect(textOf(result.content[0])).toContain('Selected Brand');
    expect(textOf(result.content[0])).toContain('brand-2');
    expect(textOf(result.content[0])).not.toContain('brand-1');
  });

  it('unwraps a single brand object returned instead of a list', async () => {
    const client = buildClient();
    client.listBrands.mockResolvedValue({ id: 'brand-9', name: 'Solo' });

    const result = await call(client, 'get_brand', {});

    expect(textOf(result.content[0])).toContain('Active Brand');
    expect(textOf(result.content[0])).toContain('brand-9');
  });

  it('reports no active brand when the list is empty', async () => {
    const client = buildClient();
    client.listBrands.mockResolvedValue([]);

    const result = await call(client, 'get_brand', {});

    expect(textOf(result.content[0])).toBe('No active brand found.');
  });

  it('rejects an unknown account management tool name', () => {
    const client = buildClient();

    expect(() => call(client, 'delete_account', {})).toThrow(
      /Unknown account management tool: delete_account/,
    );
  });
});
