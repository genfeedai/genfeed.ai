import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { describe, expect, it, vi } from 'vitest';

function setup(description: string) {
  const brands = { findOne: vi.fn().mockResolvedValue({ description }) };
  const preferences = {
    getPreferences: vi.fn().mockResolvedValue({
      keywords: [],
      categories: [],
      hashtags: [],
      platforms: [],
    }),
  };
  const videos = {
    getViralVideos: vi.fn().mockResolvedValue([
      { id: 'music', title: 'Popular official music video', viralScore: 99 },
      { id: 'agents', title: 'AI agents automate marketing', viralScore: 75 },
    ]),
  };
  const filtering = new TrendFilteringService({} as never, {} as never);
  const service = new TrendsService(
    {} as never,
    brands as never,
    {} as never,
    preferences as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    filtering,
    videos as never,
    {} as never,
    {} as never,
  );
  return { service, brands, videos, preferences };
}

describe('Brand viral videos', () => {
  it('filters before limiting and resolves the brand within its organization', async () => {
    const { service, brands, videos } = setup('AI marketing automation');
    expect(
      await service.getBrandViralVideos('org-1', 'brand-1', { limit: 1 }),
    ).toEqual([
      { id: 'agents', title: 'AI agents automate marketing', viralScore: 75 },
    ]);
    expect(brands.findOne).toHaveBeenCalledWith({
      id: 'brand-1',
      organizationId: 'org-1',
      isDeleted: false,
    });
    expect(videos.getViralVideos).toHaveBeenCalledWith({ limit: 100 });
  });
  it('does not substitute a global music chart when nothing matches', async () => {
    expect(
      await setup('fitness nutrition').service.getBrandViralVideos(
        'org-1',
        'brand-1',
        { limit: 12 },
      ),
    ).toEqual([]);
  });
  it('does not fetch global videos without usable brand context', async () => {
    const { service, videos } = setup('');
    expect(await service.getBrandViralVideos('org-1', 'brand-1', {})).toEqual(
      [],
    );
    expect(videos.getViralVideos).not.toHaveBeenCalled();
  });
  it('uses explicit brand discovery preferences', async () => {
    const { service, preferences } = setup('fitness nutrition');
    preferences.getPreferences.mockResolvedValue({
      keywords: ['AI agents'],
      categories: [],
      hashtags: [],
      platforms: [],
    });
    expect(
      await service.getBrandViralVideos('org-1', 'brand-1', {}),
    ).toHaveLength(1);
  });
  it('rejects nonexistent brand scope before looking up the content cache', async () => {
    const { service, brands } = setup('AI marketing');
    brands.findOne.mockResolvedValue(null as never);
    await expect(
      service.getTrendContent('org-1', 'foreign-brand', {}),
    ).rejects.toThrow('Brand not found');
  });

  it('does not expose videos when brand lookup fails', async () => {
    const { service, brands, videos } = setup('AI marketing');
    brands.findOne.mockResolvedValue(null as never);
    await expect(
      service.getBrandViralVideos('org-1', 'foreign-brand', {}),
    ).rejects.toThrow('Brand not found');
    expect(videos.getViralVideos).not.toHaveBeenCalled();
  });
});
