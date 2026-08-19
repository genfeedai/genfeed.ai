import { PostingSetsController } from '@api/collections/posting-sets/controllers/posting-sets.controller';
import type { PostingSetsService } from '@api/collections/posting-sets/services/posting-sets.service';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  extractRequestContext: vi.fn(() => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  })),
}));

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
  const user = { id: 'user-1' } as never;
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

    expect(extractRequestContext).toHaveBeenCalledWith(user);
    expect(service.createScoped).toHaveBeenCalledWith(body, {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
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
