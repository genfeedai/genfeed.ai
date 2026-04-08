import { API_ENDPOINTS } from '@genfeedai/constants';
import { CameraSerializer } from '@genfeedai/serializers';
import { ElementCamera } from '@models/elements/camera.model';
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
  }

  return { BaseService: MockBaseService };
});

import { CamerasService } from '@services/elements/cameras.service';

describe('CamerasService', () => {
  const token = 'cameras-token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes correct arguments to BaseService', () => {
    new CamerasService(token);

    expect(mockConstructor).toHaveBeenCalledWith(
      API_ENDPOINTS.CAMERAS,
      token,
      ElementCamera,
      CameraSerializer,
    );
  });

  it('delegates getInstance to BaseService', () => {
    CamerasService.getInstance(token);

    expect(mockGetInstance).toHaveBeenCalledWith(token);
  });
});
