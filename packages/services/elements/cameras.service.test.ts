import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConstructor = vi.hoisted(() => vi.fn());
const mockGetDataServiceInstance = vi.hoisted(() => vi.fn());

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    constructor(...args: unknown[]) {
      mockConstructor(...args);
    }

    static getDataServiceInstance(ServiceClass: any, ...args: any[]) {
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

  it('delegates getInstance to BaseService', () => {
    CamerasService.getInstance(token);

    expect(mockGetDataServiceInstance).toHaveBeenCalledWith(
      CamerasService,
      token,
    );
  });
});
