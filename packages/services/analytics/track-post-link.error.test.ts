import { openModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { PostAnalyticsService } from '@services/analytics/publication-analytics.service';
import { EnvironmentService } from '@services/core/environment.service';
import axios, { type AxiosAdapter, AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/helpers/ui/modal/modal.helper');
afterEach(() => vi.restoreAllMocks());

describe('post link import error recovery', () => {
  it.each([400, 409, 429, 500, 502, 503, 504])(
    'keeps HTTP %s errors in the import form without opening a global dialog',
    async (status) => {
      vi.spyOn(EnvironmentService, 'isProduction', 'get').mockReturnValue(
        false,
      );
      const adapter: AxiosAdapter = async (config) => {
        throw new AxiosError(
          'Import failed',
          'ERR_BAD_REQUEST',
          config,
          undefined,
          {
            config,
            status,
            statusText: 'Import failed',
            headers: {},
            data: { message: 'Correct the post link and try again' },
          },
        );
      };
      const create = axios.create.bind(axios);
      vi.spyOn(axios, 'create').mockImplementation((config) =>
        create({ ...config, adapter }),
      );
      const service = new PostAnalyticsService('token');
      await expect(
        service.trackLink({
          brandId: 'brand',
          url: 'https://example.com/post',
        }),
      ).rejects.toThrow('Correct the post link and try again');
      expect(openModal).not.toHaveBeenCalled();
    },
  );
});
