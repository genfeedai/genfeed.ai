import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type {
  IWatermarkExportRequest,
  IWatermarkExportResult,
  IWatermarkLayer,
} from '@genfeedai/contracts/interfaces';
import { assertSafeObjectKey, type StorageProvider } from '@genfeedai/storage';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import sharp, { type OverlayOptions } from 'sharp';

const POSITIONS = new Set([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);
const MAX_PIXELS = 40_000_000;
const invalid = (message: string) => new BadRequestException(message);

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character] ?? character,
  );
}

@Injectable()
export class WatermarkExportService {
  private activeRenders = 0;
  constructor(
    @Inject('STORAGE_PROVIDER') private readonly storage: StorageProvider,
    private readonly ffmpeg: FFmpegService,
  ) {}

  async render(
    request: IWatermarkExportRequest,
  ): Promise<IWatermarkExportResult> {
    if (this.activeRenders >= 2)
      throw new HttpException(
        'Watermark rendering is busy. Try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    this.activeRenders += 1;
    try {
      return await this.renderFile(request);
    } finally {
      this.activeRenders -= 1;
    }
  }

  private async renderFile(
    request: IWatermarkExportRequest,
  ): Promise<IWatermarkExportResult> {
    this.validate(request);
    await mkdir(FILES_TMP_ROOT, { recursive: true });
    const directory = await mkdtemp(path.join(FILES_TMP_ROOT, 'watermark-'));
    try {
      const input = path.join(
        directory,
        request.category === 'images' ? 'input.png' : 'input.mp4',
      );
      await this.storage.download(request.storageKey, input, FILES_TMP_ROOT);
      if ((await stat(input)).size > 1024 * 1024 * 1024)
        throw invalid('Media exceeds the 1 GB export limit');
      let width: number;
      let height: number;
      if (request.category === 'images') {
        const metadata = await sharp(input, {
          limitInputPixels: MAX_PIXELS,
        }).metadata();
        if ((metadata.pages ?? 1) > 1)
          throw invalid(
            'Animated images are not supported for watermarked exports',
          );
        const rotated = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
        width = (rotated ? metadata.height : metadata.width) ?? 0;
        height = (rotated ? metadata.width : metadata.height) ?? 0;
      } else {
        const metadata = await this.ffmpeg.getVideoMetadata(input);
        const video = metadata.streams?.find(
          (stream) => stream.codec_type === 'video',
        );
        width = video?.width ?? 0;
        height = video?.height ?? 0;
        const rotation = Number(
          video?.tags?.rotate ??
            video?.side_data_list?.find((data) => 'rotation' in data)
              ?.rotation ??
            0,
        );
        if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
      }
      if (width < 16 || height < 16 || width * height > MAX_PIXELS)
        throw invalid('Unsupported media dimensions');
      const digest = createHash('sha256').update(
        JSON.stringify({
          version: 1,
          category: request.category,
          layers: request.layers,
        }),
      );
      for await (const chunk of createReadStream(input)) digest.update(chunk);
      const overlays: OverlayOptions[] = [];
      const overlayPaths: string[] = [];
      for (const [index, layer] of request.layers.entries()) {
        const overlay = await this.createOverlay(
          layer,
          width,
          height,
          directory,
          index,
        );
        digest.update(overlay);
        const metadata = await sharp(overlay).metadata();
        const margin = Math.max(2, Math.round(Math.min(width, height) * 0.025));
        const left = layer.position.endsWith('right')
          ? width - (metadata.width ?? 0) - margin
          : margin;
        const top = layer.position.startsWith('bottom')
          ? height - (metadata.height ?? 0) - margin
          : margin;
        overlays.push({ input: overlay, left, top });
        const overlayPath = path.join(directory, `overlay-${index}.png`);
        await sharp(overlay).toFile(overlayPath);
        overlayPaths.push(overlayPath);
      }
      const extension = request.category === 'images' ? 'png' : 'mp4';
      const storageKey = `exports/watermarked/${digest.digest('hex')}.${extension}`;
      if (await this.storage.exists(storageKey))
        return { storageKey, url: this.storage.getUrl(storageKey) };
      const output = path.join(directory, `output.${extension}`);
      if (request.category === 'images') {
        await sharp(input, { limitInputPixels: MAX_PIXELS })
          .rotate()
          .composite(overlays)
          .png()
          .toFile(output);
      } else {
        const filters = overlays.map(
          (overlay, index) =>
            `${index === 0 ? '[0:v]' : `[v${index}]`}[${index + 1}:v]overlay=${overlay.left}:${overlay.top}:eof_action=repeat[v${index + 1}]`,
        );
        const result = await this.ffmpeg.executeFFmpegCapture([
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-i',
          input,
          ...overlayPaths.flatMap((overlayPath) => ['-i', overlayPath]),
          '-filter_complex',
          `${filters.join(';')};[v${overlays.length}]pad=ceil(iw/2)*2:ceil(ih/2)*2[output]`,
          '-map',
          '[output]',
          '-map',
          '0:a?',
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '20',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          '-map_metadata',
          '-1',
          '-y',
          output,
        ]);
        if (result.code !== 0)
          throw new InternalServerErrorException(
            'Watermarked video rendering failed',
          );
      }
      const storedKey = await this.storage.uploadFromFile(
        storageKey,
        output,
        FILES_TMP_ROOT,
        request.category === 'images' ? 'image/png' : 'video/mp4',
      );
      return { storageKey: storedKey, url: this.storage.getUrl(storedKey) };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private validate(request: IWatermarkExportRequest): void {
    if (!request || !['images', 'videos'].includes(request.category))
      throw invalid('Expected an image or video export');
    assertSafeObjectKey(request.storageKey, invalid);
    if (
      !Array.isArray(request.layers) ||
      request.layers.length < 1 ||
      request.layers.length > 2
    )
      throw invalid('Expected one or two watermark layers');
    for (const layer of request.layers) {
      if (
        !layer ||
        !POSITIONS.has(layer.position) ||
        !Number.isFinite(layer.opacity) ||
        layer.opacity < 0.05 ||
        layer.opacity > 1
      )
        throw invalid('Invalid watermark position or opacity');
      if (
        layer.text !== undefined &&
        (typeof layer.text !== 'string' ||
          !layer.text.trim() ||
          layer.text.length > 120 ||
          Array.from(layer.text).some(
            (character) => character.charCodeAt(0) < 32,
          ))
      )
        throw invalid('Watermark text must contain 1–120 printable characters');
      if (!layer.text && !layer.logoStorageKey)
        throw invalid('A watermark needs text or a logo');
      if (layer.logoStorageKey)
        assertSafeObjectKey(layer.logoStorageKey, invalid);
    }
  }

  private async createOverlay(
    layer: IWatermarkLayer,
    width: number,
    height: number,
    directory: string,
    index: number,
  ): Promise<Buffer> {
    const maxWidth = Math.max(1, Math.floor(width * 0.3));
    const maxHeight = Math.max(1, Math.floor(height * 0.12));
    const parts: Buffer[] = [];
    if (layer.logoStorageKey) {
      const logo = path.join(directory, `logo-${index}.png`);
      if (!(await this.storage.exists(layer.logoStorageKey)))
        throw invalid('Upload the brand watermark logo before exporting');
      await this.storage.download(layer.logoStorageKey, logo, FILES_TMP_ROOT);
      if ((await stat(logo)).size > 20 * 1024 * 1024)
        throw invalid('Watermark logo exceeds 20 MB');
      const metadata = await sharp(logo, {
        limitInputPixels: MAX_PIXELS,
      }).metadata();
      if (
        !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1
      )
        throw invalid(
          'Watermark logos must be still PNG, JPEG, or WebP images',
        );
      parts.push(
        await sharp(logo, { limitInputPixels: MAX_PIXELS })
          .rotate()
          .resize(
            maxWidth,
            Math.max(1, Math.floor(maxHeight * (layer.text ? 0.65 : 1))),
            { fit: 'inside' },
          )
          .ensureAlpha()
          .png()
          .toBuffer(),
      );
    }
    if (layer.text) {
      const text = layer.text.trim();
      const fontSize = Math.max(
        1,
        Math.min(
          height * 0.022,
          maxWidth / Math.max(1, Array.from(text).length * 0.7),
        ),
      );
      const textHeight = Math.max(1, Math.ceil(fontSize * 1.8));
      parts.push(
        await sharp(
          Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${maxWidth}" height="${textHeight}"><text x="50%" y="65%" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="${fontSize}" fill="white" stroke="black" stroke-width="${fontSize * 0.04}" paint-order="stroke">${escapeXml(text)}</text></svg>`,
          ),
        )
          .png()
          .toBuffer(),
      );
    }
    let combinedHeight = 0;
    const composites: OverlayOptions[] = [];
    for (const part of parts) {
      const metadata = await sharp(part).metadata();
      composites.push({
        input: part,
        left: Math.floor((maxWidth - (metadata.width ?? 0)) / 2),
        top: combinedHeight,
      });
      combinedHeight += metadata.height ?? 0;
    }
    const overlay = await sharp({
      create: {
        width: maxWidth,
        height: combinedHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(composites)
      .png()
      .toBuffer();
    const { data, info } = await sharp(overlay)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let offset = 3; offset < data.length; offset += 4)
      data[offset] = Math.round((data[offset] ?? 0) * layer.opacity);
    return sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();
  }
}
