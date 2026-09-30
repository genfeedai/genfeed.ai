import { EngagementRulesController } from '@api/collections/engagement-rules/controllers/engagement-rules.controller';
import type { EngagementRulesService } from '@api/collections/engagement-rules/services/engagement-rules.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';

const MUTATION_SCOPES = [
  ApiKeyScope.POSTS_DRAFT,
  ApiKeyScope.POSTS_CREATE,
  ApiKeyScope.POSTS_SCHEDULE,
];

vi.mock('@genfeedai/serializers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/serializers')>();
  return {
    ...actual,
    EngagementRuleSerializer: { serialize: vi.fn() },
  };
});

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

describe('EngagementRulesController', () => {
  const request = {} as never;
  const user = {
    brandId: 'brand-1',
    id: 'user-1',
    isSuperAdmin: false,
    organizationId: 'org-1',
    userId: 'user-1',
  } as never;
  const service = {
    createScoped: vi.fn(),
    findAllScoped: vi.fn(),
    findOneScoped: vi.fn(),
    removeScoped: vi.fn(),
    updateScoped: vi.fn(),
  };
  const controller = new EngagementRulesController(
    service as unknown as EngagementRulesService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps tenant scope onto create', async () => {
    const body = {
      actionType: 'REPOST',
      metric: 'LIKES',
      postGroupId: 'group-1',
      targetId: 'target-1',
      threshold: 10,
    };
    service.createScoped.mockResolvedValue({ id: 'rule-1' });

    await controller.create(request, user, body as never);

    expect(service.createScoped).toHaveBeenCalledWith(body, {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('rejects a cross-tenant organization override before mutation', async () => {
    await expect(
      controller.update(
        request,
        user,
        { organizationId: 'org-2' } as never,
        'rule-1',
        { isEnabled: false } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(service.updateScoped).not.toHaveBeenCalled();
  });

  it('declares posting write scopes on every mutation route', () => {
    for (const handler of [
      EngagementRulesController.prototype.create,
      EngagementRulesController.prototype.update,
      EngagementRulesController.prototype.remove,
    ]) {
      expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toEqual(
        MUTATION_SCOPES,
      );
    }
  });
});
