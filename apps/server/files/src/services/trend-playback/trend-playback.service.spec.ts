import { TrendPlaybackService } from '@files/services/trend-playback/trend-playback.service';
import type { UploadService } from '@files/services/upload/upload.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('TrendPlaybackService', () => {
  const storedKeys = ['assets/trend-playback/abc123-1.mp4'];
  const logger = { log: vi.fn() } as unknown as LoggerService;
  const upload = {
    deleteStoredObject: vi.fn(async (key: string) => {
      storedKeys.splice(storedKeys.indexOf(key), 1);
    }),
  } as unknown as UploadService;
  const service = new TrendPlaybackService(upload, logger);

  it('removes a saved copy but nothing outside the folder', async () => {
    await service.remove('assets/trend-playback/abc123-1.mp4');
    expect(storedKeys).toEqual([]);

    await expect(
      service.remove('ingredients/videos/someone-elses.mp4'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
