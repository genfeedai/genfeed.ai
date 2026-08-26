import { ListeningTopicsController } from '@api/collections/listening-topics/controllers/listening-topics.controller';
import type { ListeningTopicAnalysisService } from '@api/collections/listening-topics/services/listening-topic-analysis.service';
import type { ListeningTopicCollectorService } from '@api/collections/listening-topics/services/listening-topic-collector.service';
import type { ListeningTopicsService } from '@api/collections/listening-topics/services/listening-topics.service';
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
    ListeningEvidenceSerializer: { serialize: vi.fn() },
    ListeningSignalSerializer: { serialize: vi.fn() },
    ListeningThemeSerializer: { serialize: vi.fn() },
    ListeningTopicSerializer: { serialize: vi.fn() },
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
  const collectorService = {
    collectScoped: vi.fn(),
  };
  const analysisService = {
    analyzeScoped: vi.fn(),
    listSignalsScoped: vi.fn(),
    listThemesScoped: vi.fn(),
    reviewThemeScoped: vi.fn(),
  };
  const controller = new ListeningTopicsController(
    service as unknown as ListeningTopicsService,
    collectorService as unknown as ListeningTopicCollectorService,
    analysisService as unknown as ListeningTopicAnalysisService,
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

  it('collects a topic inside the authenticated tenant and brand scope', async () => {
    const query = { brand: 'brand-1' } as never;
    const body = { limit: 40 };
    collectorService.collectScoped.mockResolvedValue({ id: 'topic-1' });

    const result = await controller.collect(
      request,
      user,
      query,
      'topic-1',
      body,
    );

    expect(resolveRequiredBrandRequestContext).toHaveBeenCalledWith(
      user,
      query,
    );
    expect(collectorService.collectScoped).toHaveBeenCalledWith(
      'topic-1',
      body,
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    );
    expect(result).toEqual({ data: { id: 'topic-1' } });
  });

  it('analyzes explicit comparison windows inside authenticated scope', async () => {
    const query = { brand: 'brand-1' } as never;
    const body = {
      currentWindowEnd: '2026-08-26T12:00:00.000Z',
      currentWindowStart: '2026-08-25T12:00:00.000Z',
      previousWindowEnd: '2026-08-25T12:00:00.000Z',
      previousWindowStart: '2026-08-24T12:00:00.000Z',
    };
    analysisService.analyzeScoped.mockResolvedValue({
      analysisKey: 'analysis-1',
      methodologyVersion: 'deterministic-keyword-v1',
      signals: [],
      status: 'sufficient',
      themes: [],
    });

    const result = await controller.analyze(
      request,
      user,
      query,
      'topic-1',
      body,
    );

    expect(analysisService.analyzeScoped).toHaveBeenCalledWith(
      'topic-1',
      body,
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    );
    expect(result).toMatchObject({
      analysisKey: 'analysis-1',
      status: 'sufficient',
    });
  });

  it('passes tenant scope through theme and signal reads', async () => {
    const query = { brand: 'brand-1' } as never;
    analysisService.listThemesScoped.mockResolvedValue([]);
    analysisService.listSignalsScoped.mockResolvedValue([]);

    await controller.listThemes(request, user, 'topic-1', query);
    await controller.listSignals(request, user, 'topic-1', query);

    const context = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    expect(analysisService.listThemesScoped).toHaveBeenCalledWith(
      'topic-1',
      context,
      query,
    );
    expect(analysisService.listSignalsScoped).toHaveBeenCalledWith(
      'topic-1',
      context,
      query,
    );
  });

  it('reviews a theme with the authenticated opaque user id and brand scope', async () => {
    const query = { brandId: 'brand-1' } as never;
    const body = { state: 'deferred' } as const;
    analysisService.reviewThemeScoped.mockResolvedValue({
      evidenceIds: ['evidence-1'],
      id: 'theme-1',
      reviewState: 'deferred',
      reviewedBy: 'user-1',
    });

    const result = await controller.reviewTheme(
      request,
      user,
      query,
      'topic-1',
      'theme-1',
      body,
    );

    expect(analysisService.reviewThemeScoped).toHaveBeenCalledWith(
      'topic-1',
      'theme-1',
      body,
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    );
    expect(result).toEqual({
      data: expect.objectContaining({
        evidenceIds: ['evidence-1'],
        reviewState: 'deferred',
      }),
    });
  });
});
