import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { IngredientExportsController } from '@api/collections/ingredients/controllers/ingredient-exports.controller';
import { IngredientExportService } from '@api/collections/ingredients/services/ingredient-export.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService as FilesConfigService } from '@files/config/config.service';
import { FilesWatermarkExportController } from '@files/controllers/files-watermark-export.controller';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { S3Service } from '@files/services/s3/s3.service';
import { WatermarkExportService } from '@files/services/watermark-export/watermark-export.service';
import type { FFprobeData } from '@files/shared/interfaces/ffmpeg.interfaces';
import type { StorageProvider } from '@genfeedai/storage';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import type { NextFunction, Request, Response } from 'express';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';
import request from 'supertest';

vi.unmock('axios');
vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isCloudDeployment: () => true,
  isSelfHostedDeployment: () => false,
}));

function resolveBinary(staticPath: string | null, fallback: string) {
  for (const candidate of [staticPath, fallback]) {
    if (!candidate || (candidate !== fallback && !existsSync(candidate)))
      continue;
    try {
      execFileSync(candidate, ['-version'], {
        stdio: 'ignore',
        timeout: 5_000,
      });
      return candidate;
    } catch {
      // The optional static package may not have run its binary postinstall.
    }
  }
  return undefined;
}
const ffmpeg = resolveBinary(ffmpegStatic, 'ffmpeg');
const ffprobe = resolveBinary(null, 'ffprobe');
const execute = promisify(execFile);
async function encode(args: string[]) {
  if (!ffmpeg) throw new Error('FFmpeg is unavailable');
  return execute(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], {
    timeout: 20_000,
  });
}
async function probe(file: string): Promise<FFprobeData> {
  if (!ffprobe) throw new Error('FFprobe is unavailable');
  const result = await execute(ffprobe, [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    file,
  ]);
  return JSON.parse(result.stdout);
}

describe('Library brand-watermarked export with synthetic media', () => {
  let app: INestApplication;
  let filesApp: INestApplication;
  let directory: string;
  let filesOrigin: string;
  const objects = new Map<string, Buffer>();
  const ingredient = {
    id: 'image-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    category: 'IMAGE',
    s3Key: 'ingredients/source.png',
  };
  const brand = {
    id: 'brand-1',
    watermarkText: 'Preview',
    watermarkLogoId: null,
    watermarkOpacity: 0.35,
    watermarkPosition: 'bottom-right',
  };
  const prisma = {
    ingredient: { findFirst: vi.fn() },
    brand: { findFirst: vi.fn() },
    asset: { findFirst: vi.fn() },
  };
  const uploadFromFile = vi.fn(async (key: string, file: string) => {
    objects.set(key, await readFile(file));
    return key;
  });
  const storage: StorageProvider = {
    uploadFromFile,
    upload: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    listObjects: vi.fn(),
    download: vi.fn(),
    exists: vi.fn(async (key) => objects.has(key)),
    getUrl: (key) => `${filesOrigin}/fixture/${key}`,
  };

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'ingredient-export-'));
    objects.set(
      ingredient.s3Key,
      await sharp({
        create: { width: 400, height: 300, channels: 3, background: '#000000' },
      })
        .png()
        .toBuffer(),
    );
    if (ffmpeg && ffprobe) {
      const source = path.join(directory, 'source.mp4');
      await encode([
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=400x300:d=0.5',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.5',
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        '-shortest',
        '-y',
        source,
      ]);
      objects.set('ingredients/source.mp4', await readFile(source));
    }
    // The shared test setup blocks fetch; this adapter only reaches our loopback server.
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (new URL(url).origin !== filesOrigin)
        throw new Error('Non-fixture HTTP is forbidden');
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        signal: init?.signal ?? undefined,
        proxy: false,
        validateStatus: () => true,
      });
      const contentType = response.headers['content-type'];
      return new globalThis.Response(response.data, {
        status: response.status,
        headers: {
          'content-type':
            typeof contentType === 'string'
              ? contentType
              : 'application/octet-stream',
        },
      });
    });
    const filesModule = await Test.createTestingModule({
      controllers: [FilesWatermarkExportController],
      providers: [
        WatermarkExportService,
        {
          provide: FilesConfigService,
          useValue: { get: () => 'synthetic-internal-key' },
        },
        { provide: 'STORAGE_PROVIDER', useValue: storage },
        {
          provide: FFmpegService,
          useValue: {
            getVideoMetadata: probe,
            executeFFmpegCapture: async (args: string[]) => ({
              ...(await encode(args)),
              code: 0,
            }),
          },
        },
        {
          provide: S3Service,
          useValue: {
            getPresignedDownloadUrlForStoredKey: async (key: string) => key,
            downloadFromUrl: async (key: string, target: string) => {
              const source = objects.get(key);
              if (!source) throw new Error('Unknown synthetic source');
              await writeFile(target, source);
            },
          },
        },
      ],
    }).compile();
    filesApp = filesModule.createNestApplication();
    filesApp.setGlobalPrefix('v1');
    filesApp.use('/fixture', (req: Request, res: Response) => {
      const key = req.path.slice(1);
      const bytes = objects.get(key);
      if (
        req.query.Signature !== 'synthetic' ||
        !key.startsWith('exports/watermarked/') ||
        !bytes
      ) {
        res.sendStatus(403);
        return;
      }
      res.type(key.endsWith('.mp4') ? 'video/mp4' : 'image/png').send(bytes);
    });
    await filesApp.listen(0, '127.0.0.1');
    filesOrigin = await filesApp.getUrl();
    const config = {
      cdnUrl: `${filesOrigin}/fixture`,
      isAuthorizedMediaDeliveryEnabled: true,
      get: (key: string) =>
        key === 'GENFEEDAI_MICROSERVICES_FILES_URL'
          ? filesOrigin
          : key === 'GENFEEDAI_API_KEY'
            ? 'synthetic-internal-key'
            : undefined,
    };
    const module = await Test.createTestingModule({
      controllers: [IngredientExportsController],
      providers: [
        IngredientExportService,
        FilesClientService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: LoggerService, useValue: { warn: vi.fn() } },
        {
          provide: HttpService,
          useValue: new HttpService(axios.create({ proxy: false })),
        },
        {
          provide: MediaUrlService,
          useValue: {
            buildUrlFromAbsolute: (url: string) => `${url}?Signature=synthetic`,
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = {
        id: 'user-1',
        userId: 'user-1',
        organizationId: req.get('x-fixture-org') ?? 'org-1',
        brandId: 'brand-1',
      };
      next();
    });
    await app.init();
  }, 30_000);
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.ingredient.findFirst.mockResolvedValue(ingredient);
    prisma.brand.findFirst.mockResolvedValue(brand);
  });
  afterAll(async () => {
    await app?.close();
    await filesApp?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  /** Creates the export, then downloads the stored copy the way the browser does. */
  async function exportAndDownload(id: string, organization = 'org-1') {
    const created = await request(app.getHttpServer())
      .post(`/ingredients/${id}/export`)
      .set('x-fixture-org', organization)
      .expect(201);
    const { filename, url } = created.body.data.attributes as {
      filename: string;
      url: string;
    };
    const file = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      proxy: false,
    });
    return {
      body: Buffer.from(file.data),
      contentType: String(file.headers['content-type']),
      filename,
      url,
    };
  }

  it('creates a visible brand-watermarked PNG served straight from the CDN', async () => {
    const result = await exportAndDownload('image-1');
    expect(result.filename).toBe('image-1-watermarked.png');
    expect(result.contentType).toContain('image/png');
    expect(result.url).toContain('/exports/watermarked/');
    expect(await sharp(result.body).metadata()).toMatchObject({
      width: 400,
      height: 300,
      format: 'png',
    });
    const pixels = await sharp(result.body).removeAlpha().raw().toBuffer();
    expect(pixels.some((value) => value > 50)).toBe(true);
    expect(objects.get(ingredient.s3Key)).not.toEqual(result.body);
    expect(uploadFromFile).toHaveBeenCalledTimes(1);
  });

  it('serves the stored copy on a repeat export without rendering again', async () => {
    const first = await exportAndDownload('image-1');
    uploadFromFile.mockClear();
    const second = await exportAndDownload('image-1');
    expect(second.url).toBe(first.url);
    expect(second.body.equals(first.body)).toBe(true);
    expect(uploadFromFile).not.toHaveBeenCalled();
  });

  it.skipIf(!ffmpeg || !ffprobe)(
    'creates a visible brand-watermarked MP4 with its audio and duration',
    async () => {
      prisma.ingredient.findFirst.mockResolvedValue({
        ...ingredient,
        id: 'video-1',
        category: 'VIDEO',
        s3Key: 'ingredients/source.mp4',
      });
      const result = await exportAndDownload('video-1');
      expect(result.filename).toBe('video-1-watermarked.mp4');
      expect(result.contentType).toContain('video/mp4');
      const output = path.join(directory, 'download.mp4');
      await writeFile(output, result.body);
      const metadata = await probe(output);
      expect(
        metadata.streams.some((stream) => stream.codec_type === 'audio'),
      ).toBe(true);
      expect(Number(metadata.format.duration)).toBeGreaterThanOrEqual(0.5);
      expect(Number(metadata.format.duration)).toBeLessThan(0.7);
      const frame = path.join(directory, 'download-frame.png');
      await encode(['-i', output, '-frames:v', '1', '-y', frame]);
      const pixels = await sharp(frame).removeAlpha().raw().toBuffer();
      expect(pixels.some((value) => value > 50)).toBe(true);
      expect(objects.get('ingredients/source.mp4')).not.toEqual(result.body);
    },
    30_000,
  );

  it('refuses an export for a brand without a watermark instead of branding it as Genfeed', async () => {
    prisma.brand.findFirst.mockResolvedValue({ ...brand, watermarkText: null });
    await request(app.getHttpServer())
      .post('/ingredients/image-1/export')
      .expect(400);
    expect(uploadFromFile).not.toHaveBeenCalled();
  });
  it('denies an inaccessible asset with organization and soft-delete scope', async () => {
    prisma.ingredient.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post('/ingredients/image-1/export')
      .set('x-fixture-org', 'other-org')
      .expect(404);
    expect(prisma.ingredient.findFirst).toHaveBeenCalledWith({
      where: { id: 'image-1', organizationId: 'other-org', isDeleted: false },
      include: { metadata: true },
    });
    expect(uploadFromFile).not.toHaveBeenCalled();
  });
  it('denies an inaccessible brand instead of applying a default watermark', async () => {
    prisma.brand.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post('/ingredients/image-1/export')
      .expect(404);
    expect(prisma.brand.findFirst).toHaveBeenCalledWith({
      where: { id: 'brand-1', organizationId: 'org-1', isDeleted: false },
    });
    expect(uploadFromFile).not.toHaveBeenCalled();
  });
  it('rejects unsupported media before rendering', async () => {
    prisma.ingredient.findFirst.mockResolvedValue({
      ...ingredient,
      category: 'MUSIC',
    });
    await request(app.getHttpServer())
      .post('/ingredients/image-1/export')
      .expect(400);
    expect(uploadFromFile).not.toHaveBeenCalled();
  });
  it('denies unauthenticated calls to the internal renderer', async () => {
    await request(filesApp.getHttpServer())
      .post('/v1/files/watermark-export')
      .send({ category: 'images', storageKey: ingredient.s3Key, layers: [] })
      .expect(401);
    expect(uploadFromFile).not.toHaveBeenCalled();
  });
});
