import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { StudioLooksController } from '@api/collections/studio-looks/controllers/studio-looks.controller';
import { StudioLooksQueryDto } from '@api/collections/studio-looks/dto/studio-looks-query.dto';
import type {
  StudioLookRequestScope,
  StudioLooksService,
} from '@api/collections/studio-looks/services/studio-looks.service';
import { RouterPriority } from '@genfeedai/contracts';
import type { StudioLookAssetType } from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: (name: string, id: string) => ({ error: `${name}:${id}` }),
  serializeCollection: (
    _request: unknown,
    _serializer: unknown,
    data: unknown,
  ) => ({
    data,
  }),
  serializeSingle: (
    _request: unknown,
    _serializer: unknown,
    data: unknown,
  ) => ({
    data,
  }),
}));

interface StoredLook extends StudioLookRequestScope {
  assetType: string;
  id: string;
  label: string;
  [field: string]: unknown;
}

const user = {
  brandId: 'brand-1',
  id: 'session-user-id',
  organizationId: 'org-1',
  userId: 'opaque-user-id',
} as AuthenticatedUser;

const request = { originalUrl: '/studio-looks' } as unknown as Request;

const baseDto = {
  assetType: 'image' as StudioLookAssetType,
  camera: '',
  label: 'Editorial',
  lens: '',
  lighting: '',
  mood: '',
  promptTemplate: '',
  scene: '',
  style: '',
};

describe('StudioLooksController', () => {
  let looks: Map<string, StoredLook>;
  let controller: StudioLooksController;

  const inScope = (look: StoredLook, scope: StudioLookRequestScope) =>
    look.brandId === scope.brandId &&
    look.organizationId === scope.organizationId &&
    look.userId === scope.userId;

  beforeEach(() => {
    looks = new Map();
    let nextId = 1;

    controller = new StudioLooksController({
      createScoped: async (
        dto: Record<string, unknown>,
        scope: StudioLookRequestScope,
      ) => {
        const look = { ...dto, ...scope, id: `look-${nextId++}` } as StoredLook;
        looks.set(look.id, look);
        return look;
      },
      listScoped: async (
        scope: StudioLookRequestScope,
        assetType?: string,
      ) => ({
        docs: [...looks.values()].filter(
          (look) =>
            inScope(look, scope) &&
            (!assetType || look.assetType === assetType),
        ),
      }),
      removeScoped: async (id: string, scope: StudioLookRequestScope) => {
        const look = looks.get(id);
        if (!look || !inScope(look, scope)) {
          return false;
        }
        looks.delete(id);
        return true;
      },
      updateScoped: async (
        id: string,
        dto: Record<string, unknown>,
        scope: StudioLookRequestScope,
      ) => {
        const look = looks.get(id);
        if (!look || !inScope(look, scope)) {
          return null;
        }
        const updated = { ...look, ...dto };
        looks.set(id, updated);
        return updated;
      },
    } as unknown as StudioLooksService);
  });

  it('derives create ownership only from authenticated context', async () => {
    const created = await controller.create(request, user, baseDto);

    expect(created.data).toMatchObject({
      brandId: 'brand-1',
      label: 'Editorial',
      organizationId: 'org-1',
      userId: 'opaque-user-id',
    });
  });

  it('keeps the widened Generation Setup fields on create', async () => {
    await controller.create(request, user, {
      ...baseDto,
      aspectRatio: '16:9',
      brandingMode: 'brand' as const,
      modelKey: '',
      outputs: 4,
      prioritize: RouterPriority.BALANCED,
      resolution: '1080p',
    });

    expect(looks.get('look-1')).toMatchObject({
      aspectRatio: '16:9',
      brandingMode: 'brand',
      outputs: 4,
      prioritize: RouterPriority.BALANCED,
      resolution: '1080p',
    });
  });

  it('lists only the caller brand looks of the requested asset type', async () => {
    await controller.create(request, user, baseDto);
    await controller.create(request, user, {
      ...baseDto,
      assetType: 'video' as StudioLookAssetType,
      label: 'Motion',
    });
    await controller.create(
      request,
      { ...user, brandId: 'brand-2' },
      {
        ...baseDto,
        assetType: 'video' as StudioLookAssetType,
        label: 'Other brand',
      },
    );

    const listed = await controller.findAll(
      request,
      user,
      Object.assign(new StudioLooksQueryDto(), { assetType: 'video' as const }),
    );

    expect(listed.data).toEqual({
      docs: [expect.objectContaining({ label: 'Motion' })],
    });
  });

  it('updates and deletes within the authenticated scope', async () => {
    await controller.create(request, user, baseDto);

    const updated = await controller.update(request, user, 'look-1', {
      label: 'Updated',
    });
    const removed = await controller.remove(user, 'look-1');

    expect(updated.data).toMatchObject({ label: 'Updated' });
    expect(removed.data).toEqual({
      attributes: { message: 'Studio Look deleted successfully' },
      id: 'look-1',
      type: 'studio-look',
    });
    expect(looks.size).toBe(0);
  });

  it("returns not found for another brand's look and leaves it intact", async () => {
    await controller.create(request, { ...user, brandId: 'brand-2' }, baseDto);

    await expect(
      controller.update(request, user, 'look-1', { label: 'Hijacked' }),
    ).resolves.toEqual({ error: 'StudioLooksController:look-1' });
    await expect(controller.remove(user, 'look-1')).resolves.toEqual({
      error: 'StudioLooksController:look-1',
    });
    expect(looks.get('look-1')).toMatchObject({ label: 'Editorial' });
  });

  it('requires an active brand instead of accepting one from request input', async () => {
    await expect(
      controller.create(request, { ...user, brandId: '' }, baseDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.findAll(
        request,
        { ...user, brandId: '' },
        new StudioLooksQueryDto(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(looks.size).toBe(0);
  });
});
