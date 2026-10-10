import {
  axiosResponse,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { PresetsService } from '@services/elements/presets.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PresetsService HTTP contract', () => {
  let http: MockHttpInstance;
  let service: PresetsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PresetsService('token');
    http = installMockHttp(service);
  });

  it('sends null so an edit can clear a stored setting', async () => {
    http.patch.mockResolvedValueOnce(
      axiosResponse(
        resourceDocument(
          { key: 'studio-animation', label: 'Animation' },
          { id: 'preset-1', type: 'presets' },
        ),
      ),
    );

    const preset = await service.patch('preset-1', {
      duration: null,
      label: 'Animation',
      style: undefined,
    } as unknown as Parameters<PresetsService['patch']>[1]);

    expect(http.patch).toHaveBeenCalledWith('/preset-1', {
      duration: null,
      label: 'Animation',
      style: undefined,
    });
    expect(preset.label).toBe('Animation');
  });
});
