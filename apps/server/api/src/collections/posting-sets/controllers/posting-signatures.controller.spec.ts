import { PostingSignaturesController } from '@api/collections/posting-sets/controllers/posting-signatures.controller';
import type { PostingSignaturesService } from '@api/collections/posting-sets/services/posting-signatures.service';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope, CredentialPlatform } from '@genfeedai/contracts';
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
    PostingSignatureSerializer: { serialize: vi.fn() },
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

describe('PostingSignaturesController', () => {
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
  const controller = new PostingSignaturesController(
    service as unknown as PostingSignaturesService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps tenant scope onto signature create', async () => {
    const body = {
      body: 'Built with Genfeed.',
      label: 'X footer',
      platforms: [CredentialPlatform.TWITTER],
    };
    service.createScoped.mockResolvedValue({ id: 'sig-1' });

    await controller.create(request, user, body);

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
        'sig-1',
        { label: 'Hijacked' } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(service.updateScoped).not.toHaveBeenCalled();
  });

  it('declares posting write scopes on every mutation route', () => {
    for (const handler of [
      PostingSignaturesController.prototype.create,
      PostingSignaturesController.prototype.update,
      PostingSignaturesController.prototype.remove,
    ]) {
      expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toEqual(
        MUTATION_SCOPES,
      );
    }
  });

  it('passes tenant scope through signature read and remove', async () => {
    const query = { brandId: 'brand-1' } as never;
    service.findOneScoped.mockResolvedValue({ id: 'sig-1' });

    await controller.findOne(request, user, query, 'sig-1');
    await controller.remove(user, query, 'sig-1');

    expect(service.findOneScoped).toHaveBeenCalledWith('sig-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
    expect(service.removeScoped).toHaveBeenCalledWith('sig-1', {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });
});
