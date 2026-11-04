import { ConfigService } from '@files/config/config.service';
import { FilesStorageController } from '@files/controllers/files-storage.controller';
import { FILES_SERVICE_KEY_GUARD_PROVIDER } from '@files/guards/files-service-key.guard';
import { S3Service } from '@files/services/s3/s3.service';
import { UploadService } from '@files/services/upload/upload.service';
import { HealthController } from '@libs/health/health.controller';
import { LoggerService } from '@libs/logger/logger.service';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const deployment = vi.hoisted(() => ({ isSelfHosted: false }));
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  isSelfHostedDeployment: () => deployment.isSelfHosted,
}));

const SERVICE_KEY = 'files-service-key';
const env: { isDevelopment: boolean; serviceKey: string | undefined } = {
  isDevelopment: false,
  serviceKey: SERVICE_KEY,
};

const DELETE_BODY = { storageKey: 'ingredients/images/a.png' };
const UPLOAD_BODY = {
  key: 'a.png',
  source: { contentType: 'image/png', data: 'aGVsbG8=', type: 'base64' },
  type: 'images',
};

/**
 * Drives real HTTP requests through the files app's global guard: every
 * route needs the service key in `x-api-key`, health stays public, and only
 * the self-hosted browser upload is reachable without it.
 */
describe('FilesServiceKeyGuard over HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, FilesStorageController],
      providers: [
        FILES_SERVICE_KEY_GUARD_PROVIDER,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'GENFEEDAI_API_KEY' ? env.serviceKey : undefined,
            get isDevelopment() {
              return env.isDevelopment;
            },
          },
        },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
        { provide: S3Service, useValue: {} },
        {
          provide: UploadService,
          useValue: {
            deleteStoredObject: vi.fn().mockResolvedValue(undefined),
            uploadToS3: vi
              .fn()
              .mockResolvedValue({ publicUrl: 'https://cdn.test/a.png' }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    deployment.isSelfHosted = false;
    env.isDevelopment = false;
    env.serviceKey = SERVICE_KEY;
  });

  function send(
    path: string,
    headers: Record<string, string> = {},
    body?: object,
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: { 'content-type': 'application/json', ...headers },
      method: body ? 'POST' : 'GET',
    });
  }

  it.each([
    ['no key', {}, 401],
    ['a wrong key', { 'x-api-key': 'wrong-key' }, 401],
    ['a key prefix', { 'x-api-key': SERVICE_KEY.slice(0, -1) }, 401],
    [
      'the key as a bearer token',
      { authorization: `Bearer ${SERVICE_KEY}` },
      401,
    ],
    ['the service key', { 'x-api-key': SERVICE_KEY }, 201],
  ])('answers a delete with %s with %i', async (_label, headers, status) => {
    const response = await send('/v1/files/delete', headers, DELETE_BODY);

    expect(response.status).toBe(status);
  });

  it('runs the authenticated delete', async () => {
    const response = await send(
      '/v1/files/delete',
      { 'x-api-key': SERVICE_KEY },
      DELETE_BODY,
    );

    await expect(response.json()).resolves.toEqual({
      deleted: true,
      storageKey: 'ingredients/images/a.png',
    });
  });

  it.each([
    ['Cloud', false, 401],
    ['self-hosted', true, 201],
  ])(
    'answers an unauthenticated browser upload on %s with %i',
    async (_label, isSelfHosted, status) => {
      deployment.isSelfHosted = isSelfHosted;

      const response = await send('/v1/files/upload', {}, UPLOAD_BODY);

      expect(response.status).toBe(status);
    },
  );

  it('keeps other routes closed on self-hosted', async () => {
    deployment.isSelfHosted = true;

    const response = await send('/v1/files/delete', {}, DELETE_BODY);

    expect(response.status).toBe(401);
  });

  it.each([
    ['configured', SERVICE_KEY],
    ['not configured', undefined],
  ])('serves health without a key while the key is %s', async (_label, key) => {
    env.serviceKey = key;

    const response = await send('/v1/health');

    expect(response.status).toBe(200);
  });

  it('fails closed with 503 while no service key is configured', async () => {
    env.serviceKey = undefined;

    const response = await send(
      '/v1/files/delete',
      { 'x-api-key': '' },
      DELETE_BODY,
    );

    expect(response.status).toBe(503);
  });

  it.each([
    ['development without a key', true, undefined, 201],
    ['development with a key', true, SERVICE_KEY, 401],
  ])(
    'answers a keyless delete in %s with %i',
    async (_label, isDevelopment, key, status) => {
      env.isDevelopment = isDevelopment;
      env.serviceKey = key;

      const response = await send('/v1/files/delete', {}, DELETE_BODY);

      expect(response.status).toBe(status);
    },
  );
});
