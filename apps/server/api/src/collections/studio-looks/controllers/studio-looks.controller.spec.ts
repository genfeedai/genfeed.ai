import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { StudioLooksController } from '@api/collections/studio-looks/controllers/studio-looks.controller';
import { StudioLooksQueryDto } from '@api/collections/studio-looks/dto/studio-looks-query.dto';
import { StudioLooksService } from '@api/collections/studio-looks/services/studio-looks.service';
import { RouterPriority } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((name: string, id: string) => ({
    error: `${name}:${id}`,
  })),
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
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

const request = { originalUrl: '/studio-looks' } as never;

describe('StudioLooksController', () => {
  const service = {
    createScoped: vi.fn(),
    listScoped: vi.fn(),
    removeScoped: vi.fn(),
    updateScoped: vi.fn(),
  };
  let controller: StudioLooksController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new StudioLooksController(
      service as unknown as StudioLooksService,
    );
  });

  it('derives create ownership only from authenticated context', async () => {
    const dto = {
      assetType: 'image' as const,
      camera: '',
      label: 'Editorial',
      lens: '',
      lighting: '',
      mood: '',
      promptTemplate: '',
      scene: '',
      style: '',
    };
    service.createScoped.mockResolvedValueOnce({ id: 'look-1', ...dto });

    await controller.create(request, user, dto);

    expect(service.createScoped).toHaveBeenCalledWith(dto, {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'opaque-user-id',
    });
  });

  it('forwards the widened Generation Setup fields on create', async () => {
    const dto = {
      aspectRatio: '16:9',
      assetType: 'image' as const,
      brandingMode: 'brand' as const,
      camera: '',
      isPromptEnhanceEnabled: true,
      label: 'Editorial',
      lens: '',
      lighting: '',
      modelKey: '',
      mood: '',
      outputs: 4,
      prioritize: RouterPriority.BALANCED,
      promptTemplate: '',
      resolution: '1080p',
      scene: '',
      style: '',
    };
    service.createScoped.mockResolvedValueOnce({ id: 'look-1', ...dto });

    await controller.create(request, user, dto);

    expect(service.createScoped).toHaveBeenCalledWith(dto, {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'opaque-user-id',
    });
  });

  it('threads the same authenticated scope into list, update, and delete', async () => {
    const expectedScope = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'opaque-user-id',
    };
    service.listScoped.mockResolvedValueOnce({ docs: [] });
    service.updateScoped.mockResolvedValueOnce({ id: 'look-1' });
    service.removeScoped.mockResolvedValueOnce(true);

    await controller.findAll(
      request,
      user,
      Object.assign(new StudioLooksQueryDto(), { assetType: 'video' as const }),
    );
    await controller.update(request, user, 'look-1', { label: 'Updated' });
    await controller.remove(user, 'look-1');

    expect(service.listScoped).toHaveBeenCalledWith(
      expectedScope,
      'video',
      expect.any(Object),
    );
    expect(service.updateScoped).toHaveBeenCalledWith(
      'look-1',
      { label: 'Updated' },
      expectedScope,
    );
    expect(service.removeScoped).toHaveBeenCalledWith('look-1', expectedScope);
  });

  it('requires an active brand instead of accepting one from request input', async () => {
    const requestUser = { ...user, brandId: '' };

    await expect(
      controller.findAll(request, requestUser, new StudioLooksQueryDto()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.listScoped).not.toHaveBeenCalled();
  });
});
