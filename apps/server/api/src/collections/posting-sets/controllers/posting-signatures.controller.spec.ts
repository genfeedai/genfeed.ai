import { PostingSignaturesController } from '@api/collections/posting-sets/controllers/posting-signatures.controller';
import type { PostingSignaturesService } from '@api/collections/posting-sets/services/posting-signatures.service';
import { extractRequestContext } from '@api/helpers/utils/auth/auth.util';
import { CredentialPlatform } from '@genfeedai/enums';

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
  const user = { id: 'user-1' } as never;
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

    expect(extractRequestContext).toHaveBeenCalledWith(user);
    expect(service.createScoped).toHaveBeenCalledWith(body, {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
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
