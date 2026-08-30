import type { AdsResearchService } from '@server/endpoints/ads-research/ads-research.service';
import type { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import type { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedAdsService } from './saved-ads.service';

describe('SavedAdsService', () => {
  const prisma = {
    brand: { findFirst: vi.fn() },
    credential: { findFirst: vi.fn() },
    savedAd: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  } as unknown as PrismaService;
  const adsResearch = { getAdDetail: vi.fn() };
  const files = { uploadToS3: vi.fn() };
  let service: SavedAdsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new SavedAdsService(
      prisma,
      adsResearch as unknown as AdsResearchService,
      files as unknown as FilesClientService,
    );
    (prisma.brand.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'brand-1',
    });
    (prisma.credential.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: 'credential-1' },
    );
  });

  it('returns an active idempotent save without recopying media', async () => {
    (prisma.savedAd.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'saved-1',
      isDeleted: false,
    });
    adsResearch.getAdDetail.mockResolvedValue({
      id: 'record-1',
      platform: 'meta',
      sourceId: 'source-1',
    });

    const result = await service.saveMany('org-1', 'opaque-user', [
      { adId: 'record-1', brandId: 'brand-1', source: 'public' },
    ]);

    expect(result).toEqual([{ id: 'saved-1', isDeleted: false }]);
    expect(files.uploadToS3).not.toHaveBeenCalled();
  });

  it('copies server-resolved creative media and never trusts client URLs', async () => {
    (prisma.savedAd.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    adsResearch.getAdDetail.mockResolvedValue({
      creative: { imageUrls: ['https://source.example/ad.jpg'] },
      explanation: 'Strong proof',
      id: 'record-1',
      imageUrls: [],
      metrics: {},
      platform: 'meta',
      sourceId: 'source-1',
      title: 'Winner',
      usagePolicy: 'remix_allowed',
    });
    files.uploadToS3.mockResolvedValue({
      publicUrl: 'https://files.example/copied.jpg',
    });
    (prisma.savedAd.create as ReturnType<typeof vi.fn>).mockImplementation(
      ({ data }) => ({ id: 'saved-1', ...data }),
    );

    const [saved] = await service.saveMany('org-1', 'opaque-user', [
      { adId: 'record-1', brandId: 'brand-1', source: 'public' },
    ]);

    expect(adsResearch.getAdDetail).toHaveBeenCalledWith('org-1', {
      adAccountId: undefined,
      brandId: 'brand-1',
      channel: undefined,
      credentialId: undefined,
      id: 'record-1',
      loginCustomerId: undefined,
      platform: undefined,
      source: 'public',
    });
    expect(saved.imageUrls).toEqual(['https://files.example/copied.jpg']);
  });

  it('rejects a connected credential outside the requested brand before provider reads', async () => {
    (prisma.credential.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    await expect(
      service.saveMany('org-1', 'opaque-user', [
        {
          adId: 'record-1',
          brandId: 'brand-1',
          credentialId: 'credential-other',
          platform: 'meta',
          source: 'my_accounts',
        },
      ]),
    ).rejects.toThrow('credential is unavailable');

    expect(prisma.credential.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        brandId: 'brand-1',
        id: 'credential-other',
        isConnected: true,
        isDeleted: false,
        organizationId: 'org-1',
        platform: 'FACEBOOK',
      },
    });
    expect(adsResearch.getAdDetail).not.toHaveBeenCalled();
  });

  it('saves a connected ad with the authorized account context', async () => {
    (prisma.savedAd.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    adsResearch.getAdDetail.mockResolvedValue({
      body: 'Connected body',
      explanation: 'Strong proof',
      id: 'record-1',
      metrics: {},
      platform: 'google',
      sourceId: 'source-1',
      title: 'Connected winner',
      usagePolicy: 'remix_allowed',
    });
    (prisma.savedAd.create as ReturnType<typeof vi.fn>).mockImplementation(
      ({ data }) => ({ id: 'saved-1', ...data }),
    );

    const [saved] = await service.saveMany('org-1', 'opaque-user', [
      {
        adAccountId: 'acct-1',
        adId: 'source-1',
        brandId: 'brand-1',
        channel: 'search',
        credentialId: 'credential-1',
        loginCustomerId: 'mcc-1',
        platform: 'google',
        source: 'my_accounts',
      },
    ]);

    expect(prisma.credential.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        brandId: 'brand-1',
        id: 'credential-1',
        isConnected: true,
        isDeleted: false,
        organizationId: 'org-1',
        platform: 'GOOGLE_ADS',
      },
    });
    expect(adsResearch.getAdDetail).toHaveBeenCalledWith('org-1', {
      adAccountId: 'acct-1',
      brandId: 'brand-1',
      channel: 'search',
      credentialId: 'credential-1',
      id: 'source-1',
      loginCustomerId: 'mcc-1',
      platform: 'google',
      source: 'my_accounts',
    });
    expect(saved).toMatchObject({
      adAccountId: 'acct-1',
      credentialId: 'credential-1',
      loginCustomerId: 'mcc-1',
    });
  });

  it('restores a soft-deleted snapshot instead of creating a duplicate', async () => {
    (prisma.savedAd.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'saved-1',
      isDeleted: true,
    });
    adsResearch.getAdDetail.mockResolvedValue({
      body: 'Saved body',
      explanation: 'Strong proof',
      id: 'record-1',
      metrics: {},
      platform: 'meta',
      sourceId: 'source-1',
      title: 'Winner',
      usagePolicy: 'remix_allowed',
    });
    (prisma.savedAd.update as ReturnType<typeof vi.fn>).mockImplementation(
      ({ data }) => ({ id: 'saved-1', ...data }),
    );

    const [saved] = await service.saveMany('org-1', 'opaque-user', [
      { adId: 'record-1', brandId: 'brand-1', source: 'public' },
    ]);

    expect(saved).toMatchObject({ id: 'saved-1', isDeleted: false });
    expect(prisma.savedAd.create).not.toHaveBeenCalled();
    expect(prisma.savedAd.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDeleted: false }),
        where: {
          brandId: 'brand-1',
          id: 'saved-1',
          organizationId: 'org-1',
        },
      }),
    );
  });

  it('returns the concurrent winner after a unique-key race', async () => {
    const winner = { id: 'saved-winner', isDeleted: false };
    (prisma.savedAd.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    adsResearch.getAdDetail.mockResolvedValue({
      body: 'Saved body',
      explanation: 'Strong proof',
      id: 'record-1',
      metrics: {},
      platform: 'meta',
      sourceId: 'source-1',
      title: 'Winner',
      usagePolicy: 'remix_allowed',
    });
    (prisma.savedAd.create as ReturnType<typeof vi.fn>).mockRejectedValue({
      code: 'P2002',
    });

    const result = await service.saveMany('org-1', 'opaque-user', [
      { adId: 'record-1', brandId: 'brand-1', source: 'public' },
    ]);

    expect(result).toEqual([winner]);
    expect(prisma.savedAd.findFirst).toHaveBeenLastCalledWith({
      where: {
        brandId: 'brand-1',
        organizationId: 'org-1',
        platform: 'meta',
        sourceAdId: 'source-1',
      },
    });
  });

  it('fails closed when a note mutation crosses brand scope', async () => {
    (prisma.savedAd.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 0,
    });

    await expect(
      service.updateNotes('org-1', [
        { brandId: 'brand-1', id: 'saved-other', note: 'Nope' },
      ]),
    ).rejects.toThrow();

    expect(prisma.savedAd.updateMany).toHaveBeenCalledWith({
      data: { note: 'Nope' },
      where: {
        brandId: 'brand-1',
        id: 'saved-other',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('fails closed when an unsave crosses brand scope', async () => {
    (prisma.savedAd.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 0,
    });

    await expect(
      service.unsaveMany('org-1', [{ brandId: 'brand-1', id: 'saved-other' }]),
    ).rejects.toThrow();

    expect(prisma.savedAd.updateMany).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: {
        brandId: 'brand-1',
        id: 'saved-other',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });
});
