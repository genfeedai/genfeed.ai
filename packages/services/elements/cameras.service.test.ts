import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { ElementCamera } from '@genfeedai/models/elements/camera.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConstructor = vi.hoisted(() => vi.fn());
const mockGetDataServiceInstance = vi.hoisted(() => vi.fn());

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    constructor(...args: unknown[]) {
      mockConstructor(...args);
    }

    static getDataServiceInstance<TArgs extends unknown[], TService>(
      ServiceClass: new (...args: TArgs) => TService,
      ...args: TArgs
    ): TService {
      mockGetDataServiceInstance(ServiceClass, ...args);
      return new ServiceClass(...args);
    }
  }

  return { BaseService: MockBaseService };
});

import { CamerasService } from '@services/elements/cameras.service';

describe('CamerasService', () => {
  const token = 'cameras-token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the endpoint, token and model without an eager serializer', () => {
    new CamerasService(token);

    expect(mockConstructor).toHaveBeenCalledWith(
      API_ENDPOINTS.CAMERAS,
      token,
      ElementCamera,
    );
  });

  it('delegates getInstance to BaseService', () => {
    CamerasService.getInstance(token);

    expect(mockGetDataServiceInstance).toHaveBeenCalledWith(
      CamerasService,
      token,
    );
  });
});
