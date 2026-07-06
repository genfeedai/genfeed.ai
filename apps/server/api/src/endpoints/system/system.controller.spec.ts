import { SystemController } from '@api/endpoints/system/system.controller';
import type { ConfigService } from '@libs/config/config.service';

describe('SystemController', () => {
  let controller: SystemController;
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    configService = {
      get: vi.fn().mockReturnValue('development'),
    };

    controller = new SystemController(configService as never as ConfigService);
  });

  it('returns the current db mode', () => {
    expect(controller.getDbMode()).toEqual({ mode: 'development' });
    expect(configService.get).toHaveBeenCalledWith('DB_MODE');
  });

  it('falls back to development when config returns undefined', () => {
    configService.get.mockReturnValue(undefined);

    expect(controller.getDbMode()).toEqual({ mode: 'development' });
  });
});
