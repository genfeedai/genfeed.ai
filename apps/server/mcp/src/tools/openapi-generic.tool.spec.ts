import type { GeneratedRoute } from '@genfeedai/tools';
import type { ClientService } from '@mcp/services/client.service';
import { handleOpenApiGenericTool } from '@mcp/tools/openapi-generic.tool';

vi.mock('@genfeedai/tools', () => ({
  getGeneratedRoute: vi.fn(),
}));

import { getGeneratedRoute } from '@genfeedai/tools';

function makeRoute(): GeneratedRoute {
  return {
    bodyMode: 'none',
    bodyParams: [],
    isWrite: false,
    method: 'get',
    operationId: 'ActivitiesController.findOne',
    path: '/activities/{activityId}',
    pathParams: ['activityId'],
    queryParams: [],
  };
}

describe('handleOpenApiGenericTool', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('looks up the route and delegates to ClientService.executeGeneratedOperation', async () => {
    const route = makeRoute();
    (getGeneratedRoute as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      route,
    );

    const executeGeneratedOperation = vi
      .fn()
      .mockResolvedValue({ id: 'act-1' });
    const clientService = {
      executeGeneratedOperation,
    } as unknown as ClientService;

    const result = await handleOpenApiGenericTool(
      clientService,
      'get_activity',
      { activityId: 'act-1' },
    );

    expect(getGeneratedRoute).toHaveBeenCalledWith('get_activity');
    expect(executeGeneratedOperation).toHaveBeenCalledWith(route, {
      activityId: 'act-1',
    });
    expect(result).toEqual({ id: 'act-1' });
  });

  it('throws a clear error for an unknown generated tool name', async () => {
    (getGeneratedRoute as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      undefined,
    );

    const executeGeneratedOperation = vi.fn();
    const clientService = {
      executeGeneratedOperation,
    } as unknown as ClientService;

    await expect(
      handleOpenApiGenericTool(clientService, 'not_a_real_tool', {}),
    ).rejects.toThrow('Unknown generated tool: not_a_real_tool');
    expect(executeGeneratedOperation).not.toHaveBeenCalled();
  });
});
