import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { ElementMood } from '@genfeedai/models/elements/mood.model';
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

import { MoodsService } from '@services/elements/moods.service';

describe('MoodsService', () => {
  const token = 'moods-token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the endpoint, token and model without an eager serializer', () => {
    new MoodsService(token);

    expect(mockConstructor).toHaveBeenCalledWith(
      API_ENDPOINTS.MOODS,
      token,
      ElementMood,
    );
  });

  it('delegates getInstance to BaseService', () => {
    MoodsService.getInstance(token);

    expect(mockGetDataServiceInstance).toHaveBeenCalledWith(
      MoodsService,
      token,
    );
  });
});
