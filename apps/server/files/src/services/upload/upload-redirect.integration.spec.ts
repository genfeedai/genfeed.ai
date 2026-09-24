import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { ConfigService } from '@files/config/config.service';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import type { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { UploadService } from '@files/services/upload/upload.service';
import type { StorageProvider } from '@genfeedai/storage';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import axios from 'axios';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Isolate real spool files without mocking HTTP, Axios, streams or filesystem I/O.
vi.mock('@files/constants/path.constants', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  return { FILES_TMP_ROOT: mkdtempSync(join(tmpdir(), 'upload-redirect-')) };
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

describe('remote upload redirect rejection with real HTTP', () => {
  const payload = Buffer.from('controlled download fixture');
  let servers: Server[];
  let upload: ReturnType<typeof vi.fn>;
  let uploadFromFile: ReturnType<typeof vi.fn>;
  let service: UploadService;

  beforeEach(() => {
    servers = [];
    upload = vi.fn();
    uploadFromFile = vi.fn(async (_key: string, filePath: string) => {
      expect(readFileSync(filePath)).toEqual(payload);
      return 'ingredients/files/fixture';
    });
    service = new UploadService(
      { get: vi.fn() } as unknown as ConfigService,
      {} as FFmpegService,
      new HttpService(axios.create({ proxy: false })),
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

  it('streams a direct response into storage and removes the spool file', async () => {
    const origin = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      response.end(payload);
    });
    servers.push(origin);
    const url = await listen(origin);
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
});
