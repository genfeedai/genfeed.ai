import type { ClientService } from '@mcp/services/client.service';
import { handleAccountManagementTool } from '@mcp/tools/account-management.tool';

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
    expect(result.content[0].text).toContain('Account Info');
    expect(result.content[0].text).toContain('owner@example.com');
  });

  it('reports the job status for a job id', async () => {
    const client = buildClient();

    const result = await call(client, 'get_job_status', { jobId: 'job-1' });

    expect(client.getJobStatus).toHaveBeenCalledWith('job-1');
    expect(result.content[0].text).toContain('Job Status');
    expect(result.content[0].text).toContain('COMPLETED');
  });

  it('lists every brand', async () => {
    const client = buildClient();

    const result = await call(client, 'list_brands', {});

    expect(result.content[0].text).toContain('Found 2 brands');
    expect(result.content[0].text).toContain('brand-2');
  });

  it('reports an empty brand list', async () => {
    const client = buildClient();
    client.listBrands.mockResolvedValue([]);

    const result = await call(client, 'list_brands', {});

    expect(result.content[0].text).toBe('No brands found.');
  });

  it('treats a non-array brand payload as an empty list', async () => {
    const client = buildClient();
    client.listBrands.mockResolvedValue({ id: 'brand-1' });

    const result = await call(client, 'list_brands', {});

    expect(result.content[0].text).toBe('No brands found.');
  });

  it('returns the first brand as the active brand', async () => {
    const client = buildClient();

    const result = await call(client, 'get_brand', {});

    expect(result.content[0].text).toContain('Active Brand');
    expect(result.content[0].text).toContain('brand-1');
    expect(result.content[0].text).not.toContain('brand-2');
  });

  it('unwraps a single brand object returned instead of a list', async () => {
    const client = buildClient();
    client.listBrands.mockResolvedValue({ id: 'brand-9', name: 'Solo' });

    const result = await call(client, 'get_brand', {});

    expect(result.content[0].text).toContain('Active Brand');
    expect(result.content[0].text).toContain('brand-9');
  });

  it('reports no active brand when the list is empty', async () => {
    const client = buildClient();
    client.listBrands.mockResolvedValue([]);

    const result = await call(client, 'get_brand', {});

    expect(result.content[0].text).toBe('No active brand found.');
  });

  it('rejects an unknown account management tool name', () => {
    const client = buildClient();

    expect(() => call(client, 'delete_account', {})).toThrow(
      /Unknown account management tool: delete_account/,
    );
  });
});
