import { PostingSetsController } from '@api/collections/posting-sets/controllers/posting-sets.controller';
import type { PostingSetsService } from '@api/collections/posting-sets/services/posting-sets.service';
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
    PostingSetSerializer: { serialize: vi.fn() },
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

describe('PostingSetsController', () => {
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
    expandScoped: vi.fn(),
    findAllScoped: vi.fn(),
    findOneScoped: vi.fn(),
    removeScoped: vi.fn(),
    updateScoped: vi.fn(),
  };
  const controller = new PostingSetsController(
    service as unknown as PostingSetsService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps tenant scope onto create', async () => {
    const body = {
      label: 'Launch channels',
      targets: [{ credentialId: 'cred_x', targetKey: 'x-primary' }],
    };
    service.createScoped.mockResolvedValue({ id: 'set-1' });

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
        'set-1',
        { label: 'Hijacked' } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(service.updateScoped).not.toHaveBeenCalled();
  });

  it('declares posting write scopes on every mutation and expansion route', () => {
    for (const handler of [
      PostingSetsController.prototype.create,
      PostingSetsController.prototype.update,
      PostingSetsController.prototype.remove,
      PostingSetsController.prototype.expand,
    ]) {
      expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toEqual(
        MUTATION_SCOPES,
      );
    }
  });

  it('passes tenant scope through read, update, remove, and expand', async () => {
    const query = { brandId: 'brand-1' } as never;
    service.findOneScoped.mockResolvedValue({ id: 'set-1' });
    service.updateScoped.mockResolvedValue({ id: 'set-1' });
    service.expandScoped.mockResolvedValue([]);

    await controller.findOne(request, user, query, 'set-1');
    await controller.update(request, user, query, 'set-1', {
      label: 'Updated',
    } as never);
    await controller.remove(user, query, 'set-1');
    await controller.expand(user, query, 'set-1', {} as never);

    expect(service.findOneScoped).toHaveBeenCalledWith('set-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(service.updateScoped).toHaveBeenCalledWith(
      'set-1',
      { label: 'Updated' },
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    );
    expect(service.removeScoped).toHaveBeenCalledWith('set-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(service.expandScoped).toHaveBeenCalledWith(
      'set-1',
      {},
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    );
  });
});
