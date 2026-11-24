import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createConsoleTransport,
  LoggerModule,
} from '@libs/logger/logger.module';
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

  describe('console transport', () => {
    const LEVEL = Symbol.for('level');
    const MESSAGE = Symbol.for('message');

    function render(level: string, message: string, meta: object): string {
      const transport = createConsoleTransport();
      const info = transport.format?.transform({
        [LEVEL]: level,
        level,
        message,
        ...meta,
      });
      return String((info as Record<symbol, unknown>)[MESSAGE]);
    }

    it('prints every production line as one JSON object and drops debug', () => {
      vi.stubEnv('NODE_ENV', 'production');

      expect(createConsoleTransport().level).toBe('info');
      const line = render('info', 'PublicBrandsController findOneBySlug', {
        query: { slug: 'abc' },
      });
      expect(line).not.toContain('\n');
      expect(line).not.toContain('\u001b[');
      expect(JSON.parse(line)).toMatchObject({
        message: 'PublicBrandsController findOneBySlug',
        query: { slug: 'abc' },
      });
    });

    it('keeps the readable rendering and debug lines outside production', () => {
      vi.stubEnv('NODE_ENV', 'development');

      expect(createConsoleTransport().level).toBe('debug');
      expect(() =>
        JSON.parse(render('info', 'hello', { query: { slug: 'abc' } })),
      ).toThrow();
    });
  });
});
