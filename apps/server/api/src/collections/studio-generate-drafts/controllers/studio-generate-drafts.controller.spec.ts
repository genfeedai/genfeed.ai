import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { StudioGenerateDraftsController } from '@api/collections/studio-generate-drafts/controllers/studio-generate-drafts.controller';
import type { UpsertStudioGenerateDraftDto } from '@api/collections/studio-generate-drafts/dto/upsert-studio-generate-draft.dto';
import type { StudioGenerateDraftsService } from '@api/collections/studio-generate-drafts/services/studio-generate-drafts.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

const user = {
  brandId: 'brand-1',
  id: 'session-user-id',
  organizationId: 'org-1',
  userId: 'opaque-user-id',
} as AuthenticatedUser;

const request = { originalUrl: '/studio-generate-drafts/current' } as never;

const dto: UpsertStudioGenerateDraftDto = {
  attachments: [],
  brandId: 'brand-routed',
  knowledgeSelection: {},
  prompt: 'Draft prompt',
  references: [],
  settingsByType: {},
  type: 'image',
};

describe('StudioGenerateDraftsController', () => {
  const service = { findCurrent: vi.fn(), upsertCurrent: vi.fn() };
  let controller: StudioGenerateDraftsController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new StudioGenerateDraftsController(
      service as unknown as StudioGenerateDraftsService,
    );
  });

  it('returns an empty document when the user has no draft for the brand', async () => {
    service.findCurrent.mockResolvedValueOnce(null);

    await expect(
      controller.findCurrent(request, user, 'brand-routed'),
    ).resolves.toEqual({
      data: null,
    });
    // The tab's brand wins over the member's last-selected brand.
    expect(service.findCurrent).toHaveBeenCalledWith({
      brandId: 'brand-routed',
      organizationId: 'org-1',
      userId: 'opaque-user-id',
    });
  });

  it('derives write ownership only from the authenticated context', async () => {
    service.upsertCurrent.mockResolvedValueOnce({ id: 'draft-1', ...dto });

    await controller.upsertCurrent(request, user, dto);

    expect(service.upsertCurrent).toHaveBeenCalledWith(dto, {
      brandId: 'brand-routed',
      organizationId: 'org-1',
      userId: 'opaque-user-id',
    });
  });

  it('requires the requesting tab to name its brand', async () => {
    await expect(
      controller.findCurrent(request, user, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.upsertCurrent(request, user, { ...dto, brandId: ' ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.findCurrent).not.toHaveBeenCalled();
    expect(service.upsertCurrent).not.toHaveBeenCalled();
  });

  it('requires an authenticated organization', async () => {
    await expect(
      controller.upsertCurrent(request, { ...user, organizationId: '' }, dto),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.upsertCurrent).not.toHaveBeenCalled();
  });
});
