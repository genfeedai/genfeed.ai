import { AgentPublishAuditsController } from '@api/collections/agent-publish-audits/controllers/agent-publish-audits.controller';
import type { AgentPublishAuditsService } from '@api/collections/agent-publish-audits/services/agent-publish-audits.service';
import { ForbiddenException } from '@nestjs/common';

vi.mock('@genfeedai/serializers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/serializers')>();
  return {
    ...actual,
    AgentPublishAuditSerializer: { serialize: vi.fn() },
  };
});

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

describe('AgentPublishAuditsController', () => {
  const request = {} as never;
  const user = {
    brandId: 'brand-1',
    id: 'user-1',
    isSuperAdmin: false,
    organizationId: 'org-1',
    userId: 'user-1',
  } as never;
  const service = {
    findAllScoped: vi.fn(),
  };
  const controller = new AgentPublishAuditsController(
    service as unknown as AgentPublishAuditsService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists audits with tenant scope and query filters', async () => {
    service.findAllScoped.mockResolvedValue({ docs: [], total: 0 });
    const query = {
      workflowExecutionId: 'run-1',
      postGroupId: 'group-1',
    } as never;

    await controller.findAll(request, user, query);

    expect(service.findAllScoped).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      query,
    );
  });

  it('rejects a cross-tenant organization override', async () => {
    await expect(
      controller.findAll(request, user, {
        organizationId: 'org-2',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
