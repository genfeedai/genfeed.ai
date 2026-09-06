import type { ConfigService } from '@files/config/config.service';
import { FilesWatermarkExportController } from '@files/controllers/files-watermark-export.controller';
import type { WatermarkExportService } from '@files/services/watermark-export/watermark-export.service';
import type { IWatermarkExportRequest } from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';

const request: IWatermarkExportRequest = {
  category: 'images',
  storageKey: 'source.png',
  layers: [{ text: 'preview', opacity: 0.5, position: 'bottom-right' }],
};

describe('FilesWatermarkExportController', () => {
  it.each([undefined, '', 'wrong'])(
    'denies an unauthenticated render',
    async (key) => {
      const render = vi.fn();
      const controller = new FilesWatermarkExportController(
        { get: () => 'internal-key' } as unknown as ConfigService,
        { render } as unknown as WatermarkExportService,
      );
      await expect(controller.export(key, request)).rejects.toThrow();
      expect(render).not.toHaveBeenCalled();
    },
  );

  it('fails closed without a configured service secret', async () => {
    const render = vi.fn();
    const controller = new FilesWatermarkExportController(
      { get: () => undefined } as unknown as ConfigService,
      { render } as unknown as WatermarkExportService,
    );
    await expect(controller.export(undefined, request)).rejects.toThrow(
      'not configured',
    );
    expect(render).not.toHaveBeenCalled();
  });

  it('renders for the authenticated API service', async () => {
    const render = vi
      .fn()
      .mockResolvedValue({ storageKey: 'export.png', url: '/export.png' });
    const controller = new FilesWatermarkExportController(
      { get: () => 'internal-key' } as unknown as ConfigService,
      { render } as unknown as WatermarkExportService,
    );
    await expect(controller.export('internal-key', request)).resolves.toEqual({
      storageKey: 'export.png',
      url: '/export.png',
    });
    expect(render).toHaveBeenCalledWith(request);
  });
});
