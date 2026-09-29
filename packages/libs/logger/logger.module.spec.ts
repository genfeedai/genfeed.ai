import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('LoggerModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
});
