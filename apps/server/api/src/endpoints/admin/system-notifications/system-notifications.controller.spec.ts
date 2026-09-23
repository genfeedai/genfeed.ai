import { AdminSystemNotificationsController } from '@api/endpoints/admin/system-notifications/system-notifications.controller';
import { SystemEventsService } from '@api/services/system-events/system-events.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// The production auth middleware owns request.context; this harness supplies
// the two possible authenticated roles while retaining the real admin guards.
describe('deployment notification administration', () => {
  it('rejects ordinary users and serializes only operator history', async () => {
    const originalIps = process.env.ADMIN_ALLOWED_IPS;
    process.env.ADMIN_ALLOWED_IPS = '127.0.0.1';
    const overview = vi.fn().mockResolvedValue({
      id: 'system-notifications',
      configuration: { enabled: true },
      deliveries: [],
      observedSignups: 0,
      signupObservationStart: null,
      secret: 'must-not-escape',
    });
    const module = await Test.createTestingModule({
      controllers: [AdminSystemNotificationsController],
      providers: [
        { provide: SystemEventsService, useValue: { overview } },
        { provide: LoggerService, useValue: { warn: vi.fn() } },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.use(
      (
        req: {
          headers: Record<string, string>;
          context?: { isSuperAdmin: boolean };
        },
        _res: unknown,
        next: () => void,
      ) => {
        req.context = { isSuperAdmin: req.headers['test-role'] === 'admin' };
        next();
      },
    );
    await app.init();
    try {
      await request(app.getHttpServer())
        .get('/admin/system-notifications')
        .expect(403);
      await request(app.getHttpServer())
        .patch('/admin/system-notifications')
        .send({ enabled: false, eventTypes: [] })
        .expect(403);
      await request(app.getHttpServer())
        .post('/admin/system-notifications/deliveries/evt_1/retry')
        .expect(403);
      expect(overview).not.toHaveBeenCalled();
      const response = await request(app.getHttpServer())
        .get('/admin/system-notifications')
        .set('test-role', 'admin')
        .expect(200);
      const body = response.body;
      expect(body.data.attributes.observedSignups).toBe(0);
      expect(JSON.stringify(body)).not.toContain('must-not-escape');
    } finally {
      await app.close();
      if (originalIps === undefined) delete process.env.ADMIN_ALLOWED_IPS;
      else process.env.ADMIN_ALLOWED_IPS = originalIps;
    }
  });
});
