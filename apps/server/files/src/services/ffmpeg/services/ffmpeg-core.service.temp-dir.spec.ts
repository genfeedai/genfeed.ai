import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import type { LoggerService } from '@libs/logger/logger.service';

/** The job's temp directory is the one `getTempPath` made, on a real disk. */
describe('FFmpegCoreService.removeTempDir', () => {
  const type = 'remove-temp-dir-spec';
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const service = new FFmpegCoreService(
    logger as unknown as LoggerService,
    { getBinaryPaths: () => ({ ffmpegPath: '', ffprobePath: '' }) } as never,
    { get: () => undefined } as never,
  );

  afterAll(() => {
    rmSync(path.join(FILES_TMP_ROOT, type), { force: true, recursive: true });
  });

  it('removes the job directory with its files and leaves other jobs alone', async () => {
    const mine = service.getTempPath(type, 'job-1');
    const other = service.getTempPath(type, 'job-2');
    writeFileSync(path.join(mine, 'input.mp4'), 'x');
    mkdirSync(path.join(mine, 'frames'));
    writeFileSync(path.join(other, 'input.mp4'), 'y');

    await service.removeTempDir(type, 'job-1');

    expect(existsSync(mine)).toBe(false);
    expect(existsSync(path.join(other, 'input.mp4'))).toBe(true);
  });

  it('does nothing for a directory that is already gone', async () => {
    await service.removeTempDir(type, 'never-made');

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('refuses a name that climbs out of the temp root', async () => {
    await service.removeTempDir(type, '..');

    expect(logger.error).toHaveBeenCalled();
    expect(existsSync(FILES_TMP_ROOT)).toBe(true);
  });
});
