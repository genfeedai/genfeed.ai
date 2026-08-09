import { User } from '@genfeedai/models/auth/user.model';
import { Brand } from '@genfeedai/models/organization/brand.model';
import { Organization } from '@genfeedai/models/organization/organization.model';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { UsersService } from '@services/organization/users.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('UsersService', () => {
  let service: UsersService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UsersService('users-token');
    http = installMockHttp(service);
  });

  it('getInstance caches per token', () => {
    const first = UsersService.getInstance('tok');
    expect(UsersService.getInstance('tok')).toBe(first);
  });

  it('findMeBrands GETs me/brands and maps Brand models', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'brand_1', label: 'B' }])),
    );

    const result = await service.findMeBrands({ limit: 10 });

    expect(http.get).toHaveBeenCalledWith('me/brands', {
      params: { limit: 10 },
    });
    expect(result[0]).toBeInstanceOf(Brand);
  });

  it('findAllMeBrands walks every server page', async () => {
    http.get
      .mockResolvedValueOnce(
        axiosResponse(
          collectionDocument([{ id: 'brand_1', label: 'A' }], {
            pagination: { limit: 100, page: 1, pages: 2, total: 2 },
          }),
        ),
      )
      .mockResolvedValueOnce(
        axiosResponse(
          collectionDocument([{ id: 'brand_2', label: 'B' }], {
            pagination: { limit: 100, page: 2, pages: 2, total: 2 },
          }),
        ),
      );

    const result = await service.findAllMeBrands();

    expect(http.get).toHaveBeenNthCalledWith(1, 'me/brands', {
      params: { limit: 100, page: 1 },
    });
    expect(http.get).toHaveBeenNthCalledWith(2, 'me/brands', {
      params: { limit: 100, page: 2 },
    });
    expect(result.map((brand) => brand.id)).toEqual(['brand_1', 'brand_2']);
  });

  it('findMeOrganizations maps Organization models', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'org_1', label: 'Org' }])),
    );

    const result = await service.findMeOrganizations();

    expect(http.get).toHaveBeenCalledWith('me/organizations');
    expect(result[0]).toBeInstanceOf(Organization);
  });

  it('patchMeBrand PATCHes the brand under me/brands', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ label: 'Renamed' }, { id: 'brand_1' })),
    );

    const result = await service.patchMeBrand('brand_1', {
      label: 'Renamed',
    });

    expect(http.patch).toHaveBeenCalledWith('me/brands/brand_1', {
      label: 'Renamed',
    });
    expect(result).toBeInstanceOf(Brand);
  });

  it('clearMeBrandSelection PATCHes a null selectedBrandId', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ email: 'a@b.c' }, { id: 'user_1' })),
    );

    await service.clearMeBrandSelection();

    expect(http.patch).toHaveBeenCalledWith('me', { selectedBrandId: null });
  });

  it('patchSettings serializes and PATCHes user settings', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ theme: 'dark' }, { id: 'setting_1' })),
    );

    const result = await service.patchSettings('user_1', { theme: 'dark' });

    expect(http.patch).toHaveBeenCalledWith('/user_1/settings', {
      theme: 'dark',
    });
    expect(result).toMatchObject({ theme: 'dark' });
  });

  it('findMe GETs the current user', async () => {
    http.get.mockResolvedValue(
      axiosResponse(resourceDocument({ email: 'a@b.c' }, { id: 'user_1' })),
    );

    const result = await service.findMe();

    expect(http.get).toHaveBeenCalledWith('me');
    expect(result).toBeInstanceOf(User);
  });

  it('patchMe PATCHes the current user', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(resourceDocument({ firstName: 'V' }, { id: 'user_1' })),
    );

    const result = await service.patchMe({ firstName: 'V' });

    expect(http.patch).toHaveBeenCalledWith('me', { firstName: 'V' });
    expect(result).toBeInstanceOf(User);
  });

  it('dismissAssetGate PATCHes the asset-gate flag', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(
        resourceDocument({ hasDismissedAssetGate: true }, { id: 'user_1' }),
      ),
    );

    await service.dismissAssetGate();

    expect(http.patch).toHaveBeenCalledWith('me/asset-gate', {
      hasDismissedAssetGate: true,
    });
  });
});
