import { FilesWatermarkExportController } from '@files/controllers/files-watermark-export.controller';
import type { WatermarkExportService } from '@files/services/watermark-export/watermark-export.service';
import type { IWatermarkExportRequest } from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';

const request: IWatermarkExportRequest = {
  category: 'images',
  storageKey: 'source.png',
  layers: [{ text: 'preview', opacity: 0.5, position: 'bottom-right' }],
};

// Service-key authentication for this route is the app-wide
// FilesServiceKeyGuard; see files-service-key.guard.spec.ts.
describe('FilesWatermarkExportController', () => {
  it('returns the rendered export', async () => {
    const render = vi
      .fn()
      .mockResolvedValue({ storageKey: 'export.png', url: '/export.png' });
    const controller = new FilesWatermarkExportController({
      render,
    } as unknown as WatermarkExportService);
    await expect(controller.export(request)).resolves.toEqual({
      storageKey: 'export.png',
      url: '/export.png',
    });
  });
});
