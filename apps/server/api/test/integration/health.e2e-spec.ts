import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '@test/app.module';
import request from 'supertest';

describe('Health Endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/v1/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', 'ok');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('service');
          expect(res.body).toHaveProperty('version');
        });
    });
  });

  describe('/v1/health/ready (GET)', () => {
    it('should return readiness status', () => {
      return request(app.getHttpServer())
        .get('/v1/health/ready')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', 'ready');
          expect(res.body).toHaveProperty('service');
          expect(res.body).toHaveProperty('version');
        });
    });
  });

  describe('/v1/health/live (GET)', () => {
    it('should return liveness status', () => {
      return request(app.getHttpServer())
        .get('/v1/health/live')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', 'alive');
          expect(res.body).toHaveProperty('service');
          expect(res.body).toHaveProperty('version');
        });
    });
  });
});
