import { Activity } from '@genfeedai/models/analytics/activity.model';
import { Credential } from '@genfeedai/models/auth/credential.model';
import { Article } from '@genfeedai/models/content/article.model';
import { Post } from '@genfeedai/models/content/post.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import { Brand } from '@genfeedai/models/organization/brand.model';
import { Link } from '@genfeedai/models/social/link.model';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { PagesService } from '@services/content/pages.service';
import { BrandsService } from '@services/social/brands.service';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('BrandsService HTTP methods', () => {
  const brandId = 'brand_1';
  let service: BrandsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new BrandsService('brands-token');
    http = installMockHttp(service);
  });

  it.each(['legacy', 'explicit undefined', 'reviewed'] as const)(
    'preserves exact %s approval transport and server review digest',
    async (mode) => {
      const updatedAt = '2026-10-01T00:00:00.000Z';
      const reviewHash = `sha256:${'a'.repeat(64)}`;
      http.post.mockResolvedValue(
        axiosResponse(
          resourceDocument(
            {
              status: 'APPROVED',
              updatedAt,
              generationRulesReviewHash: reviewHash,
            },
            { id: 'revision-1' },
          ),
        ),
      );
      const result =
        mode === 'legacy'
          ? await service.approveBrandOsRevision(
              brandId,
              'revision-1',
              updatedAt,
            )
          : await service.approveBrandOsRevision(
              brandId,
              'revision-1',
              updatedAt,
              mode === 'reviewed' ? reviewHash : undefined,
            );
      expect(http.post).toHaveBeenCalledExactlyOnceWith(
        `/${brandId}/brand-os/revisions/revision-1/approve`,
        mode === 'reviewed'
          ? { updatedAt, reviewedGenerationRulesHash: reviewHash }
          : { updatedAt },
      );
      expect(result).toMatchObject({
        id: 'revision-1',
        generationRulesReviewHash: reviewHash,
      });
    },
  );

  it('retains the exact saved draft candidate through authenticated list, get and save transport', async () => {
    const candidate = `sha256:${'b'.repeat(64)}`;
    const attributes = {
      brandId,
      organizationId: 'org',
      status: 'DRAFT',
      updatedAt: 'saved-time',
      generationRulesReviewCandidateHash: candidate,
      content: { fields: {}, generationRules: { schemaVersion: 1 } },
    };
    http.get.mockResolvedValueOnce(
      axiosResponse(
        collectionDocument([{ id: 'revision-1', ...attributes }], {
          type: 'brand-os-revisions',
        }),
      ),
    );
    const revisions = await service.listBrandOsRevisions(brandId);
    expect(revisions[0]).toMatchObject({
      generationRulesReviewCandidateHash: candidate,
    });
    http.get.mockResolvedValueOnce(
      axiosResponse(resourceDocument(attributes, { id: 'revision-1' })),
    );
    expect(
      await service.getBrandOsRevision(brandId, 'revision-1'),
    ).toMatchObject({ generationRulesReviewCandidateHash: candidate });
    expect(http.get).toHaveBeenLastCalledWith(
      `/${brandId}/brand-os/revisions/revision-1`,
      { signal: undefined },
    );
    const content = revisions[0].content;
    const request = { content, updatedAt: 'saved-time' };
    http.patch.mockResolvedValueOnce(
      axiosResponse(resourceDocument(attributes, { id: 'revision-1' })),
    );
    expect(
      await service.updateBrandOsRevision(brandId, 'revision-1', request),
    ).toMatchObject({ generationRulesReviewCandidateHash: candidate });
    expect(http.patch).toHaveBeenCalledExactlyOnceWith(
      `/${brandId}/brand-os/revisions/revision-1`,
      request,
    );
    http.post.mockResolvedValueOnce(
      axiosResponse(
        resourceDocument(
          {
            status: 'APPROVED',
            generationRulesReviewHash: candidate,
          },
          { id: 'revision-1' },
        ),
      ),
    );
    await service.approveBrandOsRevision(
      brandId,
      'revision-1',
      'saved-time',
      candidate,
    );
    expect(http.post).toHaveBeenCalledWith(
      `/${brandId}/brand-os/revisions/revision-1/approve`,
      { updatedAt: 'saved-time', reviewedGenerationRulesHash: candidate },
    );
  });

  it('keeps a missing optional review digest absent in the client revision', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ status: 'APPROVED' }, { id: 'legacy' })),
    );
    const result = await service.approveBrandOsRevision(
      brandId,
      'legacy',
      'saved-time',
    );
    expect(result).not.toHaveProperty('generationRulesReviewHash');
    expect(result).not.toHaveProperty('generationRulesReviewCandidateHash');
  });

  it('starts a scan with the exact request and AbortSignal', async () => {
    const signal = new AbortController().signal;
    const data = { requestId: 'request-1', url: 'HTTPS://Acme.dev/path' };
    http.post.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          { status: 'pending', brandId },
          { id: data.requestId },
        ),
      ),
    );
    await expect(
      service.startBrandOsScan(brandId, data, signal),
    ).resolves.toMatchObject({
      id: data.requestId,
      status: 'pending',
      brandId,
    });
    expect(http.post).toHaveBeenCalledWith(`/${brandId}/brand-os/scan`, data, {
      signal,
    });
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('reads a scan resource and null absence with the supplied signal', async () => {
    const signal = new AbortController().signal;
    http.get.mockResolvedValueOnce(
      axiosResponse(
        resourceDocument(
          { status: 'ready', revisionId: 'revision-1' },
          { id: 'request-1' },
        ),
      ),
    );
    await expect(
      service.getBrandOsScan(brandId, signal),
    ).resolves.toMatchObject({ id: 'request-1', revisionId: 'revision-1' });
    expect(http.get).toHaveBeenCalledWith(`/${brandId}/brand-os/scan`, {
      signal,
    });
    http.get.mockResolvedValueOnce(axiosResponse({ data: null }));
    await expect(service.getBrandOsScan(brandId)).resolves.toBeNull();
    expect(http.get).toHaveBeenLastCalledWith(`/${brandId}/brand-os/scan`, {
      signal: undefined,
    });
  });

  it.each([
    new Error('409'),
    new Error('403'),
    new Error('404'),
    Object.assign(new Error('cancelled'), { name: 'AbortError' }),
  ])('propagates scan failure without retry: %s', async (error) => {
    http.post.mockRejectedValue(error);
    http.get.mockRejectedValue(error);
    await expect(
      service.startBrandOsScan(brandId, {
        requestId: 'request-1',
        url: 'https://acme.dev',
      }),
    ).rejects.toBe(error);
    await expect(service.getBrandOsScan(brandId)).rejects.toBe(error);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('serializes explicit null watermark values so existing text and logo can be cleared', async () => {
    let requestBody: unknown;
    const instance = axios.create({
      adapter: async (config) => {
        requestBody = config.data;
        return {
          config,
          data: resourceDocument(
            { label: 'Acme', watermarkText: null, watermarkLogoId: null },
            { id: brandId },
          ),
          headers: {},
          status: 200,
          statusText: 'OK',
        };
      },
    });
    Object.defineProperty(service, 'instance', {
      value: instance,
      configurable: true,
    });
    await service.updateWatermark(brandId, {
      watermarkText: null,
      watermarkLogoId: null,
      watermarkOpacity: 0.35,
      watermarkPosition: 'bottom-right',
    });
    expect(requestBody).toBe(
      JSON.stringify({
        watermarkText: null,
        watermarkLogoId: null,
        watermarkOpacity: 0.35,
        watermarkPosition: 'bottom-right',
      }),
    );
  });

  it('findOneBySlug GETs the slug route and maps a Brand', async () => {
    http.get.mockResolvedValue(
      axiosResponse(resourceDocument({ slug: 'acme' }, { id: brandId })),
    );

    const result = await service.findOneBySlug('acme');

    expect(http.get).toHaveBeenCalledWith('slug', {
      params: { slug: 'acme' },
    });
    expect(result).toBeInstanceOf(Brand);
  });

  it('findBrandCredentials GETs credentials scoped to the brand', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([{ id: 'cred_1', platform: 'instagram' }]),
      ),
    );

    const result = await service.findBrandCredentials(brandId);

    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('/credentials'),
      { params: { brand: brandId } },
    );
    expect(result[0]).toBeInstanceOf(Credential);
  });

  it('findBrandLinks GETs links scoped to the brand', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'link_1', url: 'https://x' }])),
    );

    const result = await service.findBrandLinks(brandId);

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining('/links'), {
      params: { brand: brandId },
    });
    expect(result[0]).toBeInstanceOf(Link);
  });

  it('findBrandActivities records pagination when page is set', async () => {
    const setCurrentPage = vi.spyOn(PagesService, 'setCurrentPage');
    const setTotalPages = vi.spyOn(PagesService, 'setTotalPages');
    const setTotalDocs = vi.spyOn(PagesService, 'setTotalDocs');
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([{ id: 'act_1', key: 'post.created' }], {
          pagination: { limit: 10, page: 2, pages: 3, total: 22 },
        }),
      ),
    );

    const result = await service.findBrandActivities(brandId, { page: 2 });

    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('/activities'),
      { params: { brandId, page: 2 } },
    );
    expect(setCurrentPage).toHaveBeenCalledWith(2);
    expect(setTotalPages).toHaveBeenCalledWith(3);
    expect(setTotalDocs).toHaveBeenCalledWith(22);
    expect(result[0]).toBeInstanceOf(Activity);
  });

  it('findBrandPosts records pagination and returns items', async () => {
    const setTotalDocs = vi.spyOn(PagesService, 'setTotalDocs');
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([{ id: 'post_1', label: 'P' }], {
          pagination: { limit: 10, page: 1, pages: 2, total: 12 },
        }),
      ),
    );

    const result = await service.findBrandPosts(brandId, { page: 1 });

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining('/posts'), {
      params: { brandId, page: 1 },
    });
    expect(setTotalDocs).toHaveBeenCalledWith(12);
    expect(result[0]).toBeInstanceOf(Post);
  });

  it('findBrandPostsPage defaults pagination without links', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'post_1', label: 'P' }])),
    );

    const page = await service.findBrandPostsPage(brandId);

    expect(page).toMatchObject({
      hasNext: false,
      hasPrevious: false,
      page: 1,
      total: 1,
      totalPages: 1,
    });
  });

  it.each([
    ['findBrandVideos', '/videos', Video],
    ['findBrandImages', '/images', Image],
    ['findBrandArticles', '/articles', Article],
  ] as const)('%s GETs %s scoped to the brand', async (method, path, Model) => {
    const setCurrentPage = vi.spyOn(PagesService, 'setCurrentPage');
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([{ id: 'item_1', label: 'Item' }], {
          pagination: { limit: 10, page: 1, pages: 1, total: 1 },
        }),
      ),
    );

    const result = await service[method](brandId, { page: 1 });

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining(path), {
      params: { brand: brandId, page: 1 },
    });
    expect(setCurrentPage).toHaveBeenCalledWith(1);
    expect(result[0]).toBeInstanceOf(Model);
  });

  it('updateAgentConfig PATCHes the agent-config route', async () => {
    http.patch.mockResolvedValue(axiosResponse(undefined));

    await service.updateAgentConfig(brandId, { persona: 'friendly' });

    expect(http.patch).toHaveBeenCalledWith(`/${brandId}/agent-config`, {
      persona: 'friendly',
    });
  });

  it('generateBrandVoice POSTs with the brand id defaulted', async () => {
    const profile = { tone: 'bold' };
    http.post.mockResolvedValue(axiosResponse({ data: profile }));

    const result = await service.generateBrandVoice(brandId, {
      industry: 'saas',
    });

    expect(http.post).toHaveBeenCalledWith(
      `/${brandId}/agent-config/generate-voice`,
      { brandId, industry: 'saas' },
    );
    expect(result).toEqual(profile);
  });

  it('crawlBrandKitWebsite POSTs the crawl request', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ status: 'ready' }, { id: 'draft_1' })),
    );

    const result = await service.crawlBrandKitWebsite(brandId, {
      url: 'https://acme.dev',
    });

    expect(http.post).toHaveBeenCalledWith(`/${brandId}/brand-kit/crawl`, {
      url: 'https://acme.dev',
    });
    expect(result).toMatchObject({ id: 'draft_1' });
  });

  it('applyBrandKitDraft POSTs the apply request', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ isApplied: true }, { id: 'apply_1' })),
    );

    const result = await service.applyBrandKitDraft(brandId, {
      draftId: 'draft_1',
    });

    expect(http.post).toHaveBeenCalledWith(`/${brandId}/brand-kit/apply`, {
      draftId: 'draft_1',
    });
    expect(result).toMatchObject({ isApplied: true });
  });

  it('claims and reads the authenticated Brand OS handoff', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ status: 'claimed' }, { id: brandId })),
    );

    await service.claimBrandOsPreview(brandId, {
      previewToken: 'a'.repeat(43),
    });
    expect(http.post).toHaveBeenCalledWith(
      `/${brandId}/brand-kit/brand-os/claim`,
      { previewToken: 'a'.repeat(43) },
    );

    http.get.mockResolvedValue(
      axiosResponse(resourceDocument({ status: 'claimed' }, { id: brandId })),
    );
    await service.getClaimedBrandOsDraft(brandId);
    expect(http.get).toHaveBeenCalledWith(`/${brandId}/brand-kit/brand-os`);
  });

  it('importBrandKitAssets POSTs the import request', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ imported: 2 }, { id: 'import_1' })),
    );

    const result = await service.importBrandKitAssets(brandId, {
      assets: [],
    });

    expect(http.post).toHaveBeenCalledWith(
      `/${brandId}/brand-kit/assets/import`,
      { assets: [] },
    );
    expect(result).toMatchObject({ imported: 2 });
  });

  it('findBrandAnalytics GETs analytics with optional query', async () => {
    http.get.mockResolvedValue(
      axiosResponse(resourceDocument({ views: 5 }, { id: 'analytics_1' })),
    );

    const result = await service.findBrandAnalytics(brandId, {
      startDate: '2026-01-01',
    });

    expect(http.get).toHaveBeenCalledWith(`/${brandId}/analytics`, {
      params: { startDate: '2026-01-01' },
    });
    expect(result).toMatchObject({ views: 5 });
  });

  it('findBrandAnalytics omits the config without a query', async () => {
    http.get.mockResolvedValue(
      axiosResponse(resourceDocument({ views: 5 }, { id: 'analytics_1' })),
    );

    await service.findBrandAnalytics(brandId);

    expect(http.get).toHaveBeenCalledWith(`/${brandId}/analytics`);
  });

  it('findBrandAnalyticsTimeSeries GETs the timeseries', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'pt_1', views: 2 }])),
    );

    const result = await service.findBrandAnalyticsTimeSeries(brandId, {
      endDate: '2026-02-01',
      startDate: '2026-01-01',
    });

    expect(http.get).toHaveBeenCalledWith(`/${brandId}/analytics/timeseries`, {
      params: { endDate: '2026-02-01', startDate: '2026-01-01' },
    });
    expect(result).toEqual([{ id: 'pt_1', views: 2 }]);
  });

  it('createManualBrandKitDraft POSTs the manual input', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ status: 'draft' }, { id: 'draft_2' })),
    );

    const result = await service.createManualBrandKitDraft(brandId, {
      label: 'Manual',
    });

    expect(http.post).toHaveBeenCalledWith(`/${brandId}/brand-kit/manual`, {
      label: 'Manual',
    });
    expect(result).toMatchObject({ id: 'draft_2' });
  });

  it('previewWebsite POSTs the website preview request', async () => {
    const preview = { label: 'Acme', slug: 'acme' };
    http.post.mockResolvedValue(axiosResponse({ data: preview }));

    const result = await service.previewWebsite('https://acme.dev');

    expect(http.post).toHaveBeenCalledWith('/website-preview', {
      websiteUrl: 'https://acme.dev',
    });
    expect(result).toEqual(preview);
  });

  it('previewWebsite defaults to {} when the payload is empty', async () => {
    http.post.mockResolvedValue(axiosResponse(undefined));
    await expect(service.previewWebsite('https://acme.dev')).resolves.toEqual(
      {},
    );
  });

  it('scrape POSTs the setup request and returns the envelope', async () => {
    const setup = { status: 'queued', success: true };
    http.post.mockResolvedValue(axiosResponse(setup));

    const result = await service.scrape(brandId, { url: 'https://acme.dev' });

    expect(http.post).toHaveBeenCalledWith(`/${brandId}/scrape`, {
      url: 'https://acme.dev',
    });
    expect(result).toEqual(setup);
  });

  it('renameWithOrganizationSync PATCHes with the sync flag', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'Acme' }, { id: brandId })),
    );

    const result = await service.renameWithOrganizationSync(brandId, 'Acme', {
      description: 'desc',
    });

    expect(http.patch).toHaveBeenCalledWith(`/${brandId}`, {
      description: 'desc',
      label: 'Acme',
      syncOrganizationName: true,
    });
    expect(result).toBeInstanceOf(Brand);
  });

  it('addReferenceImages POSTs the image batch', async () => {
    const outcome = { count: 1, success: true };
    http.post.mockResolvedValue(axiosResponse(outcome));

    const images = [
      { category: 'LOGO', url: 'https://cdn/logo.png' },
    ] as Parameters<BrandsService['addReferenceImages']>[1];
    const result = await service.addReferenceImages(brandId, images);

    expect(http.post).toHaveBeenCalledWith(`/${brandId}/reference-images`, {
      images,
    });
    expect(result).toEqual(outcome);
  });

  it('getRelocationPreview GETs the preview scoped to the destination', async () => {
    const preview = { movingResources: [] };
    http.get.mockResolvedValue(axiosResponse({ data: preview }));

    const result = await service.getRelocationPreview(brandId, 'org_2');

    expect(http.get).toHaveBeenCalledWith(`/${brandId}/relocation-preview`, {
      params: { organizationId: 'org_2' },
    });
    expect(result).toEqual(preview);
  });

  it('relocateBrand PATCHes and returns brand plus meta summary', async () => {
    http.patch.mockResolvedValue(
      axiosResponse({
        ...resourceDocument({ label: 'Acme' }, { id: brandId }),
        meta: { membersSevered: 1, workflowsMoved: 2 },
      }),
    );

    const result = await service.relocateBrand(brandId, {
      organizationId: 'org_2',
    });

    expect(http.patch).toHaveBeenCalledWith(`/${brandId}`, {
      organizationId: 'org_2',
    });
    expect(result.brand).toBeInstanceOf(Brand);
    expect(result.summary).toEqual({ membersSevered: 1, workflowsMoved: 2 });
  });
});
