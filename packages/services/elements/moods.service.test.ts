import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementMood } from '@genfeedai/models/elements/mood.model';
import { MoodSerializer } from '@genfeedai/serializers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConstructor = vi.hoisted(() => vi.fn());
const mockGetInstance = vi.hoisted(() => vi.fn());

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    constructor(...args: unknown[]) {
      mockConstructor(...args);
    }

    static getInstance(token: string) {
      return mockGetInstance(token);
    }

    static getDataServiceInstance(ServiceClass: any, ...args: any[]) {
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

  it('passes correct arguments to BaseService', () => {
    new MoodsService(token);

    expect(mockConstructor).toHaveBeenCalledWith(
      API_ENDPOINTS.MOODS,
      token,
      ElementMood,
      MoodSerializer,
    );
  });

  it('delegates getInstance to BaseService', () => {
    MoodsService.getInstance(token);

    expect(mockGetInstance).toHaveBeenCalledWith(token);
  });
});
