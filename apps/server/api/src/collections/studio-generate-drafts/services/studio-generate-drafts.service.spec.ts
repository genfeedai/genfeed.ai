vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { UpsertStudioGenerateDraftDto } from '@api/collections/studio-generate-drafts/dto/upsert-studio-generate-draft.dto';
import { StudioGenerateDraftsService } from '@api/collections/studio-generate-drafts/services/studio-generate-drafts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { MemberRole } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scope = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'opaque-user-id',
};

const dto: UpsertStudioGenerateDraftDto = {
  brandId: 'brand-1',
  attachments: [{ id: 'upload-1', role: 'startFrame' }],
  knowledgeSelection: { sourceIds: ['source-1'] },
  prompt: 'A slow dolly shot across a neon street',
  references: [
    { id: 'library-1', role: 'reference' },
    { id: 'deleted-1', role: 'endFrame' },
  ],
  settingsByType: {
    image: { aspectRatio: '1:1' },
    unknown: { aspectRatio: '1:1' },
    video: { duration: 5, modelKey: 'model-1' },
  } as UpsertStudioGenerateDraftDto['settingsByType'],
  type: 'video',
};

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    ...scope,
    attachments: [{ id: 'upload-1', role: 'startFrame' }],
    createdAt: new Date('2026-09-28T10:00:00.000Z'),
    id: 'draft-1',
    isDeleted: false,
    knowledgeSelection: { sourceIds: ['source-1'] },
    prompt: dto.prompt,
    references: [{ id: 'library-1', role: 'reference' }],
    settingsByType: {
      image: { aspectRatio: '1:1' },
      video: { duration: 5, modelKey: 'model-1' },
    },
    type: 'video',
    updatedAt: new Date('2026-09-28T10:00:01.000Z'),
    ...overrides,
  };
}

describe('StudioGenerateDraftsService', () => {
  const brand = { findFirst: vi.fn() };
  const member = { findFirst: vi.fn() };
  const ingredient = { findMany: vi.fn() };
  const studioGenerateDraft = {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const logger = { warn: vi.fn() };
  let service: StudioGenerateDraftsService;

  beforeEach(() => {
    vi.clearAllMocks();
    brand.findFirst.mockResolvedValue({ id: 'brand-1' });
    member.findFirst.mockResolvedValue({
      brands: [],
      role: { key: MemberRole.USER },
    });
    studioGenerateDraft.updateMany.mockResolvedValue({ count: 1 });
    service = new StudioGenerateDraftsService(
      {
        brand,
        ingredient,
        member,
        studioGenerateDraft,
      } as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
  });

  it('reads only the live draft of the authenticated user in the active brand', async () => {
    studioGenerateDraft.findFirst.mockResolvedValueOnce(null);

    await expect(service.findCurrent(scope)).resolves.toBeNull();

    expect(studioGenerateDraft.findFirst).toHaveBeenCalledWith({
      where: {
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        userId: 'opaque-user-id',
      },
    });
    expect(ingredient.findMany).not.toHaveBeenCalled();
  });

  it('refuses to read a draft for a brand outside the organization', async () => {
    brand.findFirst.mockResolvedValueOnce(null);

    await expect(service.findCurrent(scope)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(brand.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(studioGenerateDraft.findFirst).not.toHaveBeenCalled();
  });

  it('refuses a brand outside the member assigned brands', async () => {
    member.findFirst.mockResolvedValue({
      brands: [{ id: 'brand-other' }],
      role: { key: MemberRole.USER },
    });

    await expect(service.findCurrent(scope)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.upsertCurrent(dto, scope)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(studioGenerateDraft.findFirst).not.toHaveBeenCalled();
    expect(studioGenerateDraft.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a caller without an active membership', async () => {
    member.findFirst.mockResolvedValue(null);

    await expect(service.findCurrent(scope)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('drops references whose ingredient is deleted or outside the brand on read', async () => {
    studioGenerateDraft.findFirst.mockResolvedValueOnce(
      buildRow({
        references: [
          { id: 'library-1', role: 'reference' },
          { id: 'foreign-1', role: 'reference' },
        ],
      }),
    );
    ingredient.findMany.mockResolvedValueOnce([
      { id: 'library-1' },
      { id: 'upload-1' },
    ]);

    const draft = await service.findCurrent(scope);

    expect(ingredient.findMany).toHaveBeenCalledWith({
      select: { id: true },
      take: 3,
      where: {
        brandId: 'brand-1',
        id: { in: ['library-1', 'foreign-1', 'upload-1'] },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(draft).toMatchObject({
      attachments: [{ id: 'upload-1', role: 'startFrame' }],
      droppedReferenceIds: ['foreign-1'],
      prompt: dto.prompt,
      references: [{ id: 'library-1', role: 'reference' }],
      type: 'video',
    });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('discards malformed stored JSON instead of returning it', async () => {
    studioGenerateDraft.findFirst.mockResolvedValueOnce(
      buildRow({
        attachments: 'not-an-array',
        knowledgeSelection: ['bad'],
        references: [{ id: 'library-1', role: 'hero' }, { role: 'reference' }],
        settingsByType: { image: 'bad', video: { duration: 5 } },
        type: 'hologram',
      }),
    );

    const draft = await service.findCurrent(scope);

    expect(draft).toMatchObject({
      attachments: [],
      droppedReferenceIds: [],
      knowledgeSelection: {},
      references: [],
      settingsByType: { video: { duration: 5 } },
      type: 'image',
    });
    expect(ingredient.findMany).not.toHaveBeenCalled();
  });

  const draftWhere = {
    brandId: 'brand-1',
    isDeleted: false,
    organizationId: 'org-1',
    userId: 'opaque-user-id',
  };
  const expectedData = {
    attachments: [{ id: 'upload-1', role: 'startFrame' }],
    knowledgeSelection: { sourceIds: ['source-1'] },
    prompt: dto.prompt,
    references: [{ id: 'library-1', role: 'reference' }],
    settingsByType: {
      image: { aspectRatio: '1:1' },
      video: { duration: 5, modelKey: 'model-1' },
    },
    type: 'video',
  };

  it('updates the scoped draft with only in-scope, de-duplicated references', async () => {
    ingredient.findMany.mockResolvedValueOnce([
      { id: 'library-1' },
      { id: 'upload-1' },
    ]);
    studioGenerateDraft.findFirst.mockResolvedValueOnce(buildRow());

    const draft = await service.upsertCurrent(
      {
        ...dto,
        references: [...dto.references, { id: 'library-1', role: 'reference' }],
      },
      scope,
    );

    expect(brand.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { id: 'brand-1', isDeleted: false, organizationId: 'org-1' },
    });
    expect(studioGenerateDraft.updateMany).toHaveBeenCalledWith({
      data: expectedData,
      where: draftWhere,
    });
    expect(studioGenerateDraft.create).not.toHaveBeenCalled();
    expect(studioGenerateDraft.findFirst).toHaveBeenCalledWith({
      where: draftWhere,
    });
    expect(ingredient.findMany).toHaveBeenCalledOnce();
    expect(draft.droppedReferenceIds).toEqual(['deleted-1']);
  });

  it('creates the row on the first save, owned by the authenticated scope', async () => {
    ingredient.findMany.mockResolvedValueOnce([
      { id: 'library-1' },
      { id: 'upload-1' },
    ]);
    studioGenerateDraft.updateMany.mockResolvedValueOnce({ count: 0 });
    studioGenerateDraft.findFirst.mockResolvedValueOnce(buildRow());

    await service.upsertCurrent(dto, scope);

    expect(studioGenerateDraft.create).toHaveBeenCalledWith({
      data: {
        ...expectedData,
        brandId: 'brand-1',
        organizationId: 'org-1',
        userId: 'opaque-user-id',
      },
    });
  });

  it('turns a lost first-save race into an update', async () => {
    ingredient.findMany.mockResolvedValueOnce([
      { id: 'library-1' },
      { id: 'upload-1' },
    ]);
    studioGenerateDraft.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    studioGenerateDraft.create.mockRejectedValueOnce({ code: 'P2002' });
    studioGenerateDraft.findFirst.mockResolvedValueOnce(buildRow());

    await service.upsertCurrent(dto, scope);

    expect(studioGenerateDraft.updateMany).toHaveBeenCalledTimes(2);
    expect(studioGenerateDraft.updateMany).toHaveBeenLastCalledWith({
      data: expectedData,
      where: draftWhere,
    });
  });

  it('keeps only flat composer fields in each type setup', async () => {
    studioGenerateDraft.findFirst.mockResolvedValueOnce(buildRow());
    ingredient.findMany.mockResolvedValueOnce([]);

    await service.upsertCurrent(
      {
        ...dto,
        settingsByType: {
          image: {
            aspectRatio: '1:1',
            blacklist: ['blurry'],
            duration: Number.POSITIVE_INFINITY,
            nested: { deep: true },
            'bad key': 'x',
            tags: [1, 2],
          },
        } as unknown as UpsertStudioGenerateDraftDto['settingsByType'],
      },
      scope,
    );

    expect(
      studioGenerateDraft.updateMany.mock.calls[0]?.[0].data,
    ).toMatchObject({
      settingsByType: {
        image: { aspectRatio: '1:1', blacklist: ['blurry'] },
      },
    });
    expect(
      studioGenerateDraft.updateMany.mock.calls[0]?.[0].data.settingsByType
        .image,
    ).not.toHaveProperty('nested');
  });

  it('rejects an oversized settings payload before writing', async () => {
    await expect(
      service.upsertCurrent(
        {
          ...dto,
          settingsByType: {
            image: Object.fromEntries(
              Array.from({ length: 40 }, (_, index) => [
                `field${index}`,
                'x'.repeat(4_000),
              ]),
            ),
          } as unknown as UpsertStudioGenerateDraftDto['settingsByType'],
        },
        scope,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(studioGenerateDraft.updateMany).not.toHaveBeenCalled();
  });

  it('skips the ingredient lookup when the draft references nothing', async () => {
    brand.findFirst.mockResolvedValueOnce({ id: 'brand-1' });
    studioGenerateDraft.findFirst.mockResolvedValueOnce(
      buildRow({ attachments: [], references: [] }),
    );

    const draft = await service.upsertCurrent(
      { ...dto, attachments: [], references: [] },
      scope,
    );

    expect(ingredient.findMany).not.toHaveBeenCalled();
    expect(draft.droppedReferenceIds).toEqual([]);
  });
});
