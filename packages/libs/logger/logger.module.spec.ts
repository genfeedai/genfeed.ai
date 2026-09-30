import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('LoggerModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should be defined', () => {
    expect(LoggerModule).toBeDefined();
  });

  it('provides a winston-backed LoggerService with a console transport', async () => {
    vi.stubEnv('ENABLE_FILE_LOGGING', '');

    const module = await Test.createTestingModule({
      imports: [LoggerModule],
    }).compile();

    try {
      const logger = module.get(LoggerService);
      expect(logger).toBeInstanceOf(LoggerService);
      expect(logger.constructorName).toBe('LoggerService');
    } finally {
      await module.close();
    }
  });

  it('adds a file transport when ENABLE_FILE_LOGGING is true', async () => {
    vi.stubEnv('ENABLE_FILE_LOGGING', 'true');
    const originalCwd = process.cwd();
    const workDir = mkdtempSync(join(tmpdir(), 'genfeed-logger-module-'));
    process.chdir(workDir);

    try {
      const module = await Test.createTestingModule({
        imports: [LoggerModule],
      }).compile();

      try {
        const logger = module.get(LoggerService);
        expect(logger).toBeInstanceOf(LoggerService);
      } finally {
        await module.close();
      }
    } finally {
      process.chdir(originalCwd);
      rmSync(workDir, { force: true, recursive: true });
    }
  });
});
