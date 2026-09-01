import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import { resolveContainedPath } from '@libs/security';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';

type S3KeyGenerator = (type: string, key: string) => string;

const SKILLS_PRO_DOWNLOAD_KEY_PREFIX = 'skills/v1/';
const MULTIPART_UPLOAD_ROOT = path.join(FILES_TMP_ROOT, 'multipart-uploads');
const createBadRequest = (message: string) => new BadRequestException(message);

export const MULTIPART_UPLOAD_LIMIT_BYTES = 200 * 1024 * 1024;

export function multipartUploadStorage() {
  return diskStorage({
    destination: (_request, _file, callback) => {
      if (!fs.existsSync(MULTIPART_UPLOAD_ROOT)) {
        fs.mkdirSync(MULTIPART_UPLOAD_ROOT, { recursive: true });
      }
      callback(null, MULTIPART_UPLOAD_ROOT);
    },
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname || '').slice(0, 16);
      callback(null, `${randomUUID()}${extension}`);
    },
  });
}

function extensionForContentType(contentType: string | undefined): string {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase();
  switch (mime) {
    case 'application/zip':
      return '.zip';
    case 'audio/mpeg':
      return '.mp3';
    case 'image/gif':
      return '.gif';
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'video/mp4':
    case 'video/quicktime':
    case 'video/webm':
      return '.mp4';
    default:
      return '';
  }
}

export function resolveMultipartPath(
  file: Express.Multer.File,
  contentType?: string,
): string {
  const sourcePath = resolveContainedPath(
    MULTIPART_UPLOAD_ROOT,
    file.path,
    createBadRequest,
  );

  if (path.extname(sourcePath) || path.extname(file.originalname || '')) {
    return sourcePath;
  }

  const extension = extensionForContentType(contentType || file.mimetype);
  if (!extension) {
    return sourcePath;
  }

  const renamedPath = resolveContainedPath(
    MULTIPART_UPLOAD_ROOT,
    `${sourcePath}${extension}`,
    createBadRequest,
  );
  fs.renameSync(sourcePath, renamedPath);
  return renamedPath;
}

export function unlinkUploadedTemp(filePath: string | undefined): void {
  if (!filePath) {
    return;
  }
  try {
    const containedPath = resolveContainedPath(
      MULTIPART_UPLOAD_ROOT,
      filePath,
      createBadRequest,
    );
    if (fs.existsSync(containedPath)) {
      fs.unlinkSync(containedPath);
    }
  } catch {
    // Temp cleanup must not mask the upload result.
  }
}

export function resolvePresignedDownloadKey(
  type: string,
  key: string,
  generateS3Key: S3KeyGenerator,
): string {
  if (type === 'skills') {
    if (!key.startsWith(SKILLS_PRO_DOWNLOAD_KEY_PREFIX)) {
      throw new BadRequestException('Invalid Skills Pro download key');
    }
    return key;
  }
  return generateS3Key(type, key);
}
