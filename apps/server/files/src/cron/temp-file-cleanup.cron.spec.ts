import path from 'node:path';
import { TempFileCleanupCron } from '@files/cron/temp-file-cleanup.cron';
import type { LoggerService } from '@libs/logger/logger.service';

// The metadata temp directory: file name -> modified time, or an error to
// throw when the file is inspected. `null` means the directory is missing.
const disk = vi.hoisted(() => ({
  files: null as Map<string, number | Error> | null,
  isBroken: false,
  listings: 0,
}));

vi.mock('node:fs', () => {
  const entry = (filePath: string) => disk.files?.get(path.basename(filePath));
  return {
    existsSync: () => {
      if (disk.isBroken) throw new Error('disk error');
      return disk.files !== null;
    },
    readdirSync: () => {
      disk.listings += 1;
      return [...(disk.files?.keys() ?? [])];
    },
    statSync: (filePath: string) => {
      const found = entry(filePath);
      if (found instanceof Error) throw found;
      return { mtimeMs: found };
    },
    unlinkSync: (filePath: string) => {
      disk.files?.delete(path.basename(filePath));
    },
  };
});

const now = new Date('2026-11-06T12:00:00.000Z').getTime();
const minutesAgo = (minutes: number) => now - minutes * 60 * 1000;

describe('TempFileCleanupCron', () => {
  let logs: Array<{ level: string; message: string }>;
  let cron: TempFileCleanupCron;

  beforeEach(() => {
    vi.useFakeTimers({ now });
    disk.files = new Map();
    disk.isBroken = false;
    disk.listings = 0;
    logs = [];
    const logAt =
      (level: string) =>
      (message: string): void => {
        logs.push({ level, message });
      };
    cron = new TempFileCleanupCron({
      error: logAt('error'),
      log: logAt('log'),
      warn: logAt('warn'),
    } as unknown as LoggerService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('manualCleanup', () => {
    it('reports nothing to clean up when the temp dir does not exist', () => {
      disk.files = null;

      expect(cron.manualCleanup()).toEqual({
        filesDeleted: 0,
        message: 'Temp directory does not exist',
        totalFiles: 0,
      });
    });

    it('deletes files older than 30 minutes and keeps recent ones', () => {
      disk.files = new Map([
        ['old.json', minutesAgo(60)],
        ['edge.json', minutesAgo(30)],
        ['new.json', minutesAgo(1)],
      ]);

      expect(cron.manualCleanup()).toEqual({
        filesDeleted: 1,
        message: 'Cleanup completed successfully',
        totalFiles: 3,
      });
      expect([...(disk.files?.keys() ?? [])]).toEqual([
        'edge.json',
        'new.json',
      ]);
    });

    it('stays quiet about each deleted file', () => {
      disk.files = new Map([['old.json', minutesAgo(60)]]);

      cron.manualCleanup();

      expect(logs).toEqual([]);
    });

    it('warns about a file it cannot inspect and keeps cleaning the rest', () => {
      disk.files = new Map<string, number | Error>([
        ['broken.json', new Error('permission denied')],
        ['old.json', minutesAgo(60)],
      ]);

      expect(cron.manualCleanup()).toMatchObject({
        filesDeleted: 1,
        totalFiles: 2,
      });
      expect(logs).toEqual([
        {
          level: 'warn',
          message: 'Failed to process file broken.json during cleanup:',
        },
      ]);
      expect([...(disk.files?.keys() ?? [])]).toEqual(['broken.json']);
    });
  });

  describe('cleanupTempFiles', () => {
    it('cleans up on metadata traffic and logs each deletion and a summary', () => {
      disk.files = new Map([['old.json', minutesAgo(60)]]);

      cron.cleanupTempFiles();

      expect(disk.files?.size).toBe(0);
      expect(logs).toEqual([
        { level: 'log', message: 'Starting local temp file cleanup...' },
        {
          level: 'log',
          message: 'Deleted old temp file: old.json (age: 60 minutes)',
        },
        {
          level: 'log',
          message: 'Cleanup completed: 1 files deleted out of 1 total files',
        },
      ]);
    });

    it('runs at most once every five minutes', () => {
      cron.cleanupTempFiles();
      cron.cleanupTempFiles();
      vi.advanceTimersByTime(5 * 60 * 1000);
      cron.cleanupTempFiles();

      expect(disk.listings).toBe(2);
    });

    it('logs an error instead of throwing when cleanup fails', () => {
      disk.isBroken = true;

      expect(() => cron.cleanupTempFiles()).not.toThrow();
      expect(logs.at(-1)).toEqual({
        level: 'error',
        message: 'Failed to cleanup temp files:',
      });
    });
  });
});
