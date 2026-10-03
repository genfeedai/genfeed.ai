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
    getJobStatus: vi
      .fn()
      .mockResolvedValue({ id: 'job-1', status: 'COMPLETED' }),
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
    expect(textOf(result.content[0])).toContain('COMPLETED');
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
