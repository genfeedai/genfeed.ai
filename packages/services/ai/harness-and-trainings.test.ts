import { HarnessProfile } from '@genfeedai/models/ai/harness-profile.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { HarnessProfilesService } from '@services/ai/harness-profiles.service';
import { TrainingsService } from '@services/ai/trainings.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('HarnessProfilesService', () => {
  let service: HarnessProfilesService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new HarnessProfilesService('harness-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = HarnessProfilesService.getInstance('tok');
    expect(HarnessProfilesService.getInstance('tok')).toBe(first);
  });

  it('findForBrand GETs profiles scoped to the brand', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'harness_1', label: 'H' }])),
    );

    const result = await service.findForBrand('brand_1');

    expect(http.get).toHaveBeenCalledWith('', {
      params: { brandId: 'brand_1' },
    });
    expect(result[0]).toBeInstanceOf(HarnessProfile);
  });

  it('createForBrand POSTs the payload', async () => {
    http.post.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'H' }, { id: 'harness_new' })),
    );

    const result = await service.createForBrand({
      brandId: 'brand_1',
      label: 'H',
    } as Parameters<HarnessProfilesService['createForBrand']>[0]);

    expect(http.post).toHaveBeenCalledWith('', {
      brandId: 'brand_1',
      label: 'H',
    });
    expect(result.id).toBe('harness_new');
  });

  it('updateProfile PATCHes the profile', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'H2' }, { id: 'harness_1' })),
    );

    const result = await service.updateProfile('harness_1', {
      label: 'H2',
    } as Parameters<HarnessProfilesService['updateProfile']>[1]);

    expect(http.patch).toHaveBeenCalledWith('/harness_1', { label: 'H2' });
    expect(result.id).toBe('harness_1');
  });

  it('proposeRules returns the suggested rules for an edit', async () => {
    http.post.mockResolvedValue(
      axiosResponse({ proposals: ['Never use "truly".'] }),
    );

    const result = await service.proposeRules({
      edited: 'Live.',
      original: 'Truly live.',
    });

    expect(http.post).toHaveBeenCalledWith(
      '/rule-proposals',
      { edited: 'Live.', original: 'Truly live.' },
      { signal: undefined },
    );
    expect(result).toEqual(['Never use "truly".']);
  });

  it('saveRules POSTs only the rules the user accepted', async () => {
    http.post.mockResolvedValue(
      axiosResponse({
        added: ['Never use "truly".'],
        guardrails: ['Never use "truly".'],
        profileId: 'harness_1',
      }),
    );

    const result = await service.saveRules({
      brandId: 'brand_1',
      rules: ['Never use "truly".'],
    });

    expect(http.post).toHaveBeenCalledWith('/rules', {
      brandId: 'brand_1',
      rules: ['Never use "truly".'],
    });
    expect(result.added).toEqual(['Never use "truly".']);
  });
});

describe('TrainingsService', () => {
  const trainingId = 'training_1';
  let service: TrainingsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new TrainingsService('trainings-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = TrainingsService.getInstance('tok');
    expect(TrainingsService.getInstance('tok')).toBe(first);
  });

  it('getTrainingImages returns images with their own pagination', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([{ id: 'img_1', label: 'I' }], {
          pagination: { limit: 10, page: 2, pages: 4, total: 33 },
        }),
      ),
    );

    const result = await service.getTrainingImages(trainingId, { page: 2 });

    expect(http.get).toHaveBeenCalledWith(`/${trainingId}/images`, {
      params: { page: 2 },
    });
    expect(result).toMatchObject({ page: 2, totalPages: 4, total: 33 });
    expect(result.items[0]).toBeInstanceOf(Image);
  });

  it('getTrainingImages derives an implicit page when links are absent', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'img_1', label: 'I' }])),
    );

    const result = await service.getTrainingImages(trainingId);

    expect(result).toMatchObject({ page: 1, totalPages: 1, total: 1 });
    expect(result.items[0]).toBeInstanceOf(Image);
  });

  it('getTrainingSources returns sources with their own pagination', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([{ id: 'src_1', label: 'S' }], {
          pagination: { limit: 10, page: 1, pages: 2, total: 11 },
        }),
      ),
    );

    const signal = new AbortController().signal;
    const result = await service.getTrainingSources(
      trainingId,
      { limit: 10, page: 1 },
      signal,
    );

    expect(http.get).toHaveBeenCalledWith(`/${trainingId}/sources`, {
      params: { limit: 10, page: 1 },
      signal,
    });
    expect(result).toMatchObject({ page: 1, totalPages: 2, total: 11 });
    expect(result.items[0]).toBeInstanceOf(Image);
  });
});
