import { ListeningTopicsController } from '@api/collections/listening-topics/controllers/listening-topics.controller';
import type { ListeningTopicsService } from '@api/collections/listening-topics/services/listening-topics.service';
import { resolveRequiredBrandRequestContext } from '@api/helpers/utils/auth/auth.util';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  resolveRequiredBrandRequestContext: vi.fn(() => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  })),
}));

vi.mock('@genfeedai/serializers', () => ({
  ListeningEvidenceSerializer: { serialize: vi.fn() },
  ListeningTopicSerializer: { serialize: vi.fn() },
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

describe('ListeningTopicsController', () => {
  const request = {} as never;
  const user = { id: 'user-1' } as never;
  const service = {
    createScoped: vi.fn(),
    findAllScoped: vi.fn(),
    findOneScoped: vi.fn(),
    listEvidence: vi.fn(),
    removeScoped: vi.fn(),
    updateScoped: vi.fn(),
  };
  const controller = new ListeningTopicsController(
    service as unknown as ListeningTopicsService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps the authenticated scope onto topic creation', async () => {
    const body = {
      keywords: ['ai'],
      label: 'AI',
      sourceIds: ['source-1'],
    };
    service.createScoped.mockResolvedValue({ id: 'topic-1' });

    await controller.create(request, user, body);

    expect(resolveRequiredBrandRequestContext).toHaveBeenCalledWith(user);
    expect(service.createScoped).toHaveBeenCalledWith(body, {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('passes tenant scope through the evidence read boundary', async () => {
    const query = { brand: 'brand-1', limit: 25, page: 1 } as never;
    service.listEvidence.mockResolvedValue({ docs: [], total: 0 });

    await controller.listEvidence(request, user, 'topic-1', query);

    expect(resolveRequiredBrandRequestContext).toHaveBeenCalledWith(
      user,
      query,
    );
    expect(service.listEvidence).toHaveBeenCalledWith(
      'topic-1',
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      query,
    );
  });
});
