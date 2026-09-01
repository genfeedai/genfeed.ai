import { TempFileCleanupCron } from '@files/cron/temp-file-cleanup.cron';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
}));
vi.mock('fs', () => fsMock);
vi.mock('node:fs', () => fsMock);

import * as fs from 'node:fs';

describe('TempFileCleanupCron', () => {
  let cron: TempFileCleanupCron;
  let logger: { log: Mock; error: Mock; warn: Mock };

  beforeEach(async () => {
    vi.clearAllMocks();

    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TempFileCleanupCron,
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    cron = module.get<TempFileCleanupCron>(TempFileCleanupCron);
  });

  it('should be defined', () => {
    expect(cron).toBeDefined();
  });

  describe('manualCleanup', () => {
    it('reports nothing to clean up when the temp dir does not exist', () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      const result = cron.manualCleanup();

      expect(result).toEqual({
        filesDeleted: 0,
        message: 'Temp directory does not exist',
        totalFiles: 0,
      });
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });

    it('deletes files older than the max age and keeps recent ones', () => {
      const now = Date.now();
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readdirSync as Mock).mockReturnValue(['old.json', 'new.json']);
      (fs.statSync as Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('old.json')) {
          return { mtimeMs: now - 60 * 60 * 1000 }; // 60 minutes old
        }
        return { mtimeMs: now }; // fresh
      });

      const result = cron.manualCleanup();

      expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('old.json'),
      );
      expect(result).toEqual({
        filesDeleted: 1,
        message: 'Cleanup completed successfully',
        totalFiles: 2,
      });
    });

    it('does not run in verbose mode and skips per-file log lines', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readdirSync as Mock).mockReturnValue(['old.json']);
      (fs.statSync as Mock).mockReturnValue({
        mtimeMs: Date.now() - 60 * 60 * 1000,
      });

      cron.manualCleanup();

      expect(logger.log).not.toHaveBeenCalled();
    });

    it('logs a warning and continues when processing a file throws', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readdirSync as Mock).mockReturnValue(['broken.json', 'old.json']);
      (fs.statSync as Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('broken.json')) {
          throw new Error('permission denied');
        }
        return { mtimeMs: Date.now() - 60 * 60 * 1000 };
      });

      const result = cron.manualCleanup();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('broken.json'),
        'permission denied',
      );
      expect(result.filesDeleted).toBe(1);
      expect(result.totalFiles).toBe(2);
    });
  });

  describe('cleanupTempFiles', () => {
    it('runs opportunistic cleanup and logs a summary', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readdirSync as Mock).mockReturnValue(['old.json']);
      (fs.statSync as Mock).mockReturnValue({
        mtimeMs: Date.now() - 60 * 60 * 1000,
      });

      cron.cleanupTempFiles();

      expect(logger.log).toHaveBeenCalledWith(
        'Starting local temp file cleanup...',
      );
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup completed: 1 files deleted'),
      );
    });

    it('throttles repeated opportunistic cleanup calls', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readdirSync as Mock).mockReturnValue([]);

      cron.cleanupTempFiles();
      cron.cleanupTempFiles();

      expect(fs.readdirSync).toHaveBeenCalledTimes(1);
      expect(logger.log).toHaveBeenCalledTimes(2);
    });

    it('logs an error instead of throwing when cleanup fails', () => {
      (fs.existsSync as Mock).mockImplementation(() => {
        throw new Error('disk error');
      });

      expect(() => cron.cleanupTempFiles()).not.toThrow();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to cleanup temp files:',
        expect.any(Error),
      );
    });
  });
});
