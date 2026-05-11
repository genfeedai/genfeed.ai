import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export interface UploadValidationOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
  required?: boolean;
}

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB

const DEFAULT_ALLOWED_MIMES: string[] = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/avi',
  'video/x-matroska',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/aac',
  'audio/flac',
  'audio/ogg',
  'audio/webm',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
];

@Injectable()
export class UploadValidationPipe
  implements PipeTransform<Express.Multer.File, Express.Multer.File>
{
  private readonly maxSizeBytes: number;
  private readonly allowedMimeTypes: Set<string>;
  private readonly allowedExtensions: Set<string>;
  private readonly required: boolean;

  constructor(options: UploadValidationOptions = {}) {
    this.maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE;
    this.allowedMimeTypes = new Set(
      options.allowedMimeTypes ?? DEFAULT_ALLOWED_MIMES,
    );
    this.allowedExtensions = new Set(options.allowedExtensions ?? []);
    this.required = options.required ?? true;
  }

  transform(file: Express.Multer.File): Express.Multer.File {
    if (!file) {
      if (this.required) {
        throw new BadRequestException('No file provided');
      }
      return file;
    }

    if (file.size > this.maxSizeBytes) {
      throw new BadRequestException(
        `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of ${(this.maxSizeBytes / 1024 / 1024).toFixed(2)}MB`,
      );
    }

    if (
      this.allowedMimeTypes.size > 0 &&
      !this.allowedMimeTypes.has(file.mimetype)
    ) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. Allowed types: ${[...this.allowedMimeTypes].join(', ')}`,
      );
    }

    if (this.allowedExtensions.size > 0) {
      const extension = file.originalname.split('.').pop()?.toLowerCase();
      if (!extension || !this.allowedExtensions.has(extension)) {
        throw new BadRequestException(
          `File extension ".${extension ?? 'unknown'}" is not allowed. Allowed extensions: ${[...this.allowedExtensions].join(', ')}`,
        );
      }
    }

    return file;
  }
}
