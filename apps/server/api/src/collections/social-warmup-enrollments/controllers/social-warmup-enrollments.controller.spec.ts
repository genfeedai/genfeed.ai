import { SocialWarmupEnrollmentsController } from '@api/collections/social-warmup-enrollments/controllers/social-warmup-enrollments.controller';
import type { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import { resolveRequiredBrandRequestContext } from '@api/helpers/utils/auth/auth.util';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  resolveRequiredBrandRequestContext: vi.fn(() => ({
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
    SocialWarmupEnrollmentSerializer: { serialize: vi.fn() },
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

describe('SocialWarmupEnrollmentsController', () => {
  const request = {} as never;
  const user = { id: 'user-1' } as never;
  const service = {
    completeItemScoped: vi.fn(),
    enrollScoped: vi.fn(),
    findAllScoped: vi.fn(),
    findOneScoped: vi.fn(),
    reopenItemScoped: vi.fn(),
    upsertSignalScoped: vi.fn(),
  };
  const controller = new SocialWarmupEnrollmentsController(
    service as unknown as SocialWarmupEnrollmentsService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps tenant scope onto enrollment', async () => {
    const body = { credentialId: 'credential-1' };
    service.enrollScoped.mockResolvedValue({ id: 'enrollment-1' });

    await controller.create(request, user, body);

    expect(resolveRequiredBrandRequestContext).toHaveBeenCalledWith(user);
    expect(service.enrollScoped).toHaveBeenCalledWith(body, {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('passes tenant scope through checklist completion', async () => {
    const query = { brandId: 'brand-1' } as never;
    service.completeItemScoped.mockResolvedValue({ id: 'enrollment-1' });

    await controller.completeItem(
      request,
      user,
      query,
      'enrollment-1',
      'watch-niche-content',
      {},
    );

    expect(resolveRequiredBrandRequestContext).toHaveBeenCalledWith(
      user,
      query,
    );
    expect(service.completeItemScoped).toHaveBeenCalledWith(
      'enrollment-1',
      'watch-niche-content',
      {},
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    );
  });
});
