import type { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedAdsService } from './saved-ads.service';

describe('SavedAdsService', () => {
  const prisma = {
    $transaction: vi.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
    brand: { findFirst: vi.fn(), findMany: vi.fn() },
    credential: { findFirst: vi.fn(), findMany: vi.fn() },
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
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (operations: Promise<unknown>[]) => Promise.all(operations),
    );
    service = new SavedAdsService(
      prisma,
      adsResearch as unknown as AdsResearchService,
      files as unknown as FilesClientService,
    );
    (prisma.brand.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'brand-1',
    });
    (prisma.brand.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'brand-1' },
    ]);
    (prisma.credential.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: 'credential-1' },
    );
    (prisma.credential.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        brandId: 'brand-1',
        id: 'credential-1',
        platform: 'GOOGLE_ADS',
      },
    ]);
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

  it('copies a provider preview when it is the only available media', async () => {
    (prisma.savedAd.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    adsResearch.getAdDetail.mockResolvedValue({
      explanation: 'Preview evidence',
      id: 'record-1',
      metrics: {},
      platform: 'meta',
      previewUrl: 'https://source.example/preview.jpg',
      sourceId: 'source-1',
      title: 'Preview only',
      usagePolicy: 'remix_allowed',
    });
    files.uploadToS3.mockResolvedValue({
      publicUrl: 'https://files.example/preview.jpg',
    });
    (prisma.savedAd.create as ReturnType<typeof vi.fn>).mockImplementation(
      ({ data }) => ({ id: 'saved-1', ...data }),
    );

    const [saved] = await service.saveMany('org-1', 'opaque-user', [
      { adId: 'record-1', brandId: 'brand-1', source: 'public' },
    ]);

    expect(saved.imageUrls).toEqual(['https://files.example/preview.jpg']);
    expect(files.uploadToS3).toHaveBeenCalledWith(
      expect.stringMatching(/\/image-0$/),
      'saved-ad-references',
      expect.objectContaining({
        url: 'https://source.example/preview.jpg',
      }),
    );
  });

  it('bounds copied media for each saved ad', async () => {
    (prisma.savedAd.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    adsResearch.getAdDetail.mockResolvedValue({
      explanation: 'Gallery evidence',
      id: 'record-1',
      imageUrls: Array.from(
        { length: 6 },
        (_, index) => `https://source.example/image-${index}.jpg`,
      ),
      metrics: {},
      platform: 'meta',
      sourceId: 'source-1',
      title: 'Gallery',
      usagePolicy: 'remix_allowed',
      videoUrls: Array.from(
        { length: 6 },
        (_, index) => `https://source.example/video-${index}.mp4`,
      ),
    });
    files.uploadToS3.mockResolvedValue({
      publicUrl: 'https://files.example/copied-media',
    });
    (prisma.savedAd.create as ReturnType<typeof vi.fn>).mockImplementation(
      ({ data }) => ({ id: 'saved-1', ...data }),
    );

    const [saved] = await service.saveMany('org-1', 'opaque-user', [
      { adId: 'record-1', brandId: 'brand-1', source: 'public' },
    ]);

    expect(files.uploadToS3).toHaveBeenCalledTimes(8);
    expect(saved.imageUrls).toHaveLength(4);
    expect(saved.videoUrls).toHaveLength(4);
  });

  it('lists only active snapshots in the requested tenant and brand', async () => {
    const rows = [{ id: 'saved-2' }, { id: 'saved-1' }];
    (prisma.savedAd.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      rows,
    );

    const result = await service.list('org-1', 'brand-1');

    expect(result).toEqual(rows);
    expect(prisma.savedAd.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('rejects a connected credential outside the requested brand before provider reads', async () => {
    (prisma.credential.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
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

    expect(prisma.credential.findMany).toHaveBeenCalledWith({
      select: { brandId: true, id: true, platform: true },
      where: {
        isConnected: true,
        isDeleted: false,
        organizationId: 'org-1',
        OR: [
          {
            brandId: 'brand-1',
            id: 'credential-other',
            platform: 'FACEBOOK',
          },
        ],
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
      videoUrls: ['provider-video-id'],
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

    expect(prisma.credential.findMany).toHaveBeenCalledWith({
      select: { brandId: true, id: true, platform: true },
      where: {
        isConnected: true,
        isDeleted: false,
        organizationId: 'org-1',
        OR: [
          {
            brandId: 'brand-1',
            id: 'credential-1',
            platform: 'GOOGLE_ADS',
          },
        ],
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
      videoUrls: [],
    });
    expect(files.uploadToS3).not.toHaveBeenCalled();
  });

  it('restores a soft-deleted snapshot instead of creating a duplicate', async () => {
    (
      prisma.savedAd.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      id: 'saved-1',
      isDeleted: true,
      note: 'Keep this note',
      userId: 'original-user',
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
        data: expect.objectContaining({
          isDeleted: false,
          userId: 'original-user',
        }),
        where: {
          brandId: 'brand-1',
          id: 'saved-1',
          isDeleted: true,
          organizationId: 'org-1',
        },
      }),
    );
    expect(
      (prisma.savedAd.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data,
    ).not.toHaveProperty('note');
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
        OR: [{ isDeleted: false }, { isDeleted: true }],
        platform: 'meta',
        sourceAdId: 'source-1',
      },
    });
  });

  it('fails closed when a note mutation crosses brand scope', async () => {
    (prisma.savedAd.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(
      service.updateNotes('org-1', [
        { brandId: 'brand-1', id: 'saved-other', note: 'Nope' },
      ]),
    ).rejects.toThrow();

    expect(prisma.savedAd.findMany).toHaveBeenCalledWith({
      select: { brandId: true, id: true },
      where: {
        OR: [{ brandId: 'brand-1', id: 'saved-other' }],
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.savedAd.update).not.toHaveBeenCalled();
  });

  it('rejects a note mutation when its brand is soft-deleted', async () => {
    (prisma.brand.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(
      service.updateNotes('org-1', [
        { brandId: 'brand-1', id: 'saved-1', note: 'Nope' },
      ]),
    ).rejects.toThrow();

    expect(prisma.brand.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: { in: ['brand-1'] },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.savedAd.findMany).not.toHaveBeenCalled();
    expect(prisma.savedAd.update).not.toHaveBeenCalled();
  });

  it('updates and returns a trimmed brand note in scope', async () => {
    (prisma.savedAd.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { brandId: 'brand-1', id: 'saved-1' },
    ]);
    (prisma.savedAd.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'saved-1',
      note: 'Keep this hook',
    });

    const result = await service.updateNotes('org-1', [
      { brandId: 'brand-1', id: 'saved-1', note: '  Keep this hook  ' },
    ]);

    expect(result).toEqual([{ id: 'saved-1', note: 'Keep this hook' }]);
    expect(prisma.savedAd.update).toHaveBeenCalledWith({
      data: { note: 'Keep this hook' },
      where: {
        brandId: 'brand-1',
        id: 'saved-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('treats an already deleted in-scope snapshot as successfully unsaved', async () => {
    (prisma.savedAd.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { brandId: 'brand-1', id: 'saved-1' },
    ]);
    (prisma.savedAd.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 0,
    });

    const result = await service.unsaveMany('org-1', [
      { brandId: 'brand-1', id: 'saved-1' },
    ]);

    expect(result).toEqual(['saved-1']);
    expect(prisma.savedAd.findMany).toHaveBeenCalledWith({
      select: { brandId: true, id: true },
      where: {
        AND: [
          { OR: [{ brandId: 'brand-1', id: 'saved-1' }] },
          { OR: [{ isDeleted: false }, { isDeleted: true }] },
        ],
        organizationId: 'org-1',
      },
    });
  });

  it('fails closed when an unsave crosses brand scope', async () => {
    (prisma.savedAd.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(
      service.unsaveMany('org-1', [{ brandId: 'brand-1', id: 'saved-other' }]),
    ).rejects.toThrow();

    expect(prisma.savedAd.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an unsave when its brand is soft-deleted', async () => {
    (prisma.brand.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(
      service.unsaveMany('org-1', [{ brandId: 'brand-1', id: 'saved-1' }]),
    ).rejects.toThrow();

    expect(prisma.brand.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: { in: ['brand-1'] },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.savedAd.findMany).not.toHaveBeenCalled();
    expect(prisma.savedAd.updateMany).not.toHaveBeenCalled();
  });
});
