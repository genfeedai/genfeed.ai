import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { NotificationRuntimeSettingsController } from './notification-runtime-settings.controller';

describe('provider runtime configuration', () => {
  it('requires internal auth and exposes only non-secret provider settings', async () => {
    const getFeatureSettingsState = vi.fn().mockResolvedValue({
      isResolved: true,
      settings: {
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        emailFromAddress: 'hello@example.com',
        secret: 'must-not-leak',
      },
    });
    const module = await Test.createTestingModule({
      controllers: [NotificationRuntimeSettingsController],
      providers: [
        {
          provide: PlatformSettingsService,
          useValue: { getFeatureSettingsState },
        },
        { provide: ConfigService, useValue: { get: () => 'internal-key' } },
        { provide: LoggerService, useValue: { error: vi.fn() } },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.init();
    try {
      const path = '/internal/platform-runtime-settings';
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer wrong')
        .expect(401);
      const response = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer internal-key')
        .expect(200);
      expect(response.body.data.attributes.emailFromAddress).toBe(
        'hello@example.com',
      );
      expect(JSON.stringify(response.body)).not.toContain('must-not-leak');
      expect(response.body.data.attributes).not.toHaveProperty(
        'generationMaxTokens',
      );
      getFeatureSettingsState.mockResolvedValue({
        isResolved: false,
        settings: DEFAULT_PLATFORM_FEATURE_SETTINGS,
      });
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer internal-key')
        .expect(503);
    } finally {
      await app.close();
    }
  });
});
