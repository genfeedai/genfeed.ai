import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { ConfigService } from '@files/config/config.service';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import type { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FileRuntimeSettingsService } from '@files/services/runtime-settings/file-runtime-settings.service';
import { UploadService } from '@files/services/upload/upload.service';
import type { StorageProvider } from '@genfeedai/storage';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Isolate real spool files without mocking HTTP, the destination guard, streams
// or filesystem I/O.
vi.mock('@files/constants/path.constants', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  return { FILES_TMP_ROOT: mkdtempSync(join(tmpdir(), 'upload-destination-')) };
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture port');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

async function rejectionStatus(promise: Promise<unknown>): Promise<number> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(HttpException);
  return (error as HttpException).getStatus();
}

describe('remote upload destination guard with real HTTP', () => {
  const payload = Buffer.from('controlled download fixture');
  let cdnUrl: string | undefined;
  let servers: Server[];
  let upload: ReturnType<typeof vi.fn>;
  let uploadFromFile: ReturnType<typeof vi.fn>;
  let service: UploadService;

  beforeEach(() => {
    cdnUrl = undefined;
    servers = [];
    upload = vi.fn();
    uploadFromFile = vi.fn(async (_key: string, filePath: string) => {
      expect(readFileSync(filePath)).toEqual(payload);
      return 'ingredients/files/fixture';
    });
    service = new UploadService(
      {
        get: async () => ({ imageCompressionQuality: 50 }),
      } as unknown as FileRuntimeSettingsService,
      {
        get: (key: string) =>
          key === 'GENFEEDAI_CDN_URL' ? cdnUrl : undefined,
      } as unknown as ConfigService,
      {} as FFmpegService,
      { log: vi.fn(), error: vi.fn() } as unknown as LoggerService,
      {
        upload,
        uploadFromFile,
        getUrl: () => 'https://cdn.example.com/fixture',
      } as unknown as StorageProvider,
    );
  });

  afterEach(async () => {
    try {
      await Promise.all(servers.map(close));
    } finally {
      rmSync(`${FILES_TMP_ROOT}/downloads`, { force: true, recursive: true });
    }
  });

  afterAll(() => rmSync(FILES_TMP_ROOT, { force: true, recursive: true }));

  it('streams a configured CDN response into storage and removes the spool file', async () => {
    const origin = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      response.end(payload);
    });
    servers.push(origin);
    const url = await listen(origin);
    cdnUrl = url;
    const result = await service.uploadToS3('fixture', 'files', {
      type: 'url',
      url: `${url}/direct`,
    });
    expect(result.size).toBe(payload.length);
    expect(uploadFromFile).toHaveBeenCalledOnce();
    expect(upload).not.toHaveBeenCalled();
    const filePath = uploadFromFile.mock.calls[0][1];
    expect(existsSync(filePath)).toBe(false);
  });

  it.each([301, 302, 303, 307, 308, 'relative'] as const)(
    'rejects %s before the redirected request or storage write',
    async (status) => {
      const targetRequest = vi.fn();
      const target = createServer((_request, response) => {
        targetRequest();
        response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        response.end(payload);
      });
      servers.push(target);
      const targetUrl = await listen(target);
      const relativeRequest = vi.fn();
      const origin = createServer((request, response) => {
        if (request.url === '/target') {
          relativeRequest();
          response.writeHead(200, {
            'Content-Type': 'application/octet-stream',
          });
          response.end(payload);
          return;
        }
        response.writeHead(status === 'relative' ? 302 : status, {
          Location: status === 'relative' ? '/target' : `${targetUrl}/target`,
        });
        response.end();
      });
      servers.push(origin);
      const originUrl = await listen(origin);
      cdnUrl = originUrl;
      await expect(
        service.uploadToS3('fixture', 'files', {
          type: 'url',
          url: `${originUrl}/redirect`,
        }),
      ).rejects.toThrow('Failed to download file from URL');
      expect(targetRequest).not.toHaveBeenCalled();
      expect(relativeRequest).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
      expect(uploadFromFile).not.toHaveBeenCalled();
      const downloads = `${FILES_TMP_ROOT}/downloads`;
      expect(existsSync(downloads) ? readdirSync(downloads) : []).toEqual([]);
    },
  );

  it('rejects an unconfigured loopback origin with 400 before connecting', async () => {
    const loopbackRequest = vi.fn();
    const loopback = createServer((_request, response) => {
      loopbackRequest();
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      response.end(payload);
    });
    servers.push(loopback);
    const loopbackUrl = await listen(loopback);
    cdnUrl = 'https://cdn.example.com';

    const status = await rejectionStatus(
      service.uploadToS3('fixture', 'files', {
        type: 'url',
        url: `${loopbackUrl}/internal`,
      }),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(loopbackRequest).not.toHaveBeenCalled();
    expect(uploadFromFile).not.toHaveBeenCalled();
  });

  it.each([
    'http://localhost:3010/v1/admin',
    'http://[::1]:3010/',
    'http://10.0.0.5/',
    'http://172.16.4.2/',
    'http://192.168.1.10/',
    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    'http://[::ffff:169.254.169.254]/latest/meta-data/',
    'http://0.0.0.0:3012/',
  ])('rejects %s with 400', async (url) => {
    const status = await rejectionStatus(
      service.uploadToS3('fixture', 'files', { type: 'url', url }),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(upload).not.toHaveBeenCalled();
    expect(uploadFromFile).not.toHaveBeenCalled();
  });
});
