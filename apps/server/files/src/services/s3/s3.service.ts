import * as fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@files/config/config.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable, Logger } from '@nestjs/common';

/** Minimal shape covering AWS SDK S3 errors */
interface S3Error extends Error {
  code?: string;
  $metadata?: { httpStatusCode?: number };
  statusCode?: number;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY') || '',
      },
      region: this.configService.get('AWS_REGION') || 'us-west-1',
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    this.bucket = this.configService.get('AWS_S3_BUCKET') || 'cdn.genfeed.ai';
  }

  async uploadFile(
    key: string,
    filePath: string,
    contentType?: string,
  ): Promise<{ Location: string; ETag: string; Key: string }> {
    const fileStream = fs.createReadStream(filePath);

    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Body: fileStream,
          Bucket: this.bucket,
          ContentType: contentType || 'video/mp4',
          Key: key,
        },
      });

      const result = await upload.done();
      const location = this.getPublicUrl(key);
      this.logger.log(`File uploaded successfully to ${location}`, {
        bucket: this.bucket,
        contentType: contentType || 'video/mp4',
        key,
      });
      return {
        ETag: result.ETag || '',
        Key: key,
        Location: location,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to upload file to S3: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType?: string,
  ): Promise<{ Location: string; ETag: string; Key: string }> {
    const startTime = Date.now();
    const bufferSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);

    this.logger.log(`Starting S3 buffer upload`, {
      bucket: this.bucket,
      bufferSize: `${bufferSizeMB} MB`,
      bufferSizeBytes: buffer.length,
      contentType: contentType || 'application/octet-stream',
      key,
    });

    try {
      const command = new PutObjectCommand({
        Body: buffer,
        Bucket: this.bucket,
        ContentLength: buffer.length,
        ContentType: contentType || 'application/octet-stream',
        Key: key,
      });

      const s3StartTime = Date.now();
      const result = await this.s3Client.send(command);
      const s3Duration = Date.now() - s3StartTime;

      const location = this.getPublicUrl(key);
      const totalDuration = Date.now() - startTime;

      this.logger.log(`Buffer uploaded successfully to S3`, {
        bufferSize: `${bufferSizeMB} MB`,
        bufferSizeBytes: buffer.length,
        contentType: contentType || 'application/octet-stream',
        etag: result.ETag,
        key,
        location,
        s3UploadDuration: `${s3Duration}ms`,
        totalDuration: `${totalDuration}ms`,
        uploadSpeed: `${(buffer.length / (1024 * 1024) / (totalDuration / 1000)).toFixed(2)} MB/s`,
      });

      return {
        ETag: result.ETag || '',
        Key: key,
        Location: location,
      };
    } catch (error: unknown) {
      const totalDuration = Date.now() - startTime;
      const s3Err = error as S3Error;
      this.logger.error(`Failed to upload buffer to S3`, {
        bufferSize: `${bufferSizeMB} MB`,
        bufferSizeBytes: buffer.length,
        contentType: contentType || 'application/octet-stream',
        duration: `${totalDuration}ms`,
        error: getErrorMessage(error),
        errorCode: s3Err?.name || s3Err?.code,
        key,
        statusCode: s3Err?.$metadata?.httpStatusCode,
      });
      throw error;
    }
  }

  async downloadFile(key: string, localPath: string): Promise<void> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      const response = await this.s3Client.send(command);

      // Ensure directory exists
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Convert stream to buffer
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      fs.writeFileSync(localPath, buffer);
      this.logger.log(`File downloaded successfully to ${localPath}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to download file from S3: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  async downloadFromUrl(url: string, localPath: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response
          .text()
          .catch(() => response.statusText);

        // Parse error response if it's JSON
        let errorMessage = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.errors?.[0]?.detail) {
            errorMessage = errorJson.errors[0].detail;
          } else if (errorJson.message) {
            errorMessage = errorJson.message;
          }
        } catch {
          // Not JSON, use text as-is
        }

        throw new Error(
          `Failed to download from ${url}: ${response.status} ${response.statusText} - ${errorMessage}`,
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Ensure directory exists
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(localPath, buffer);
      this.logger.log(`File downloaded from URL to ${localPath}`);
    } catch (error: unknown) {
      this.logger.error('Failed to download file from URL', {
        error: getErrorMessage(error) || 'Unknown error',
        statusCode: getErrorMessage(error)?.match(/:\s(\d+)/)?.[1],
        url,
      });
      throw error;
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.s3Client.send(command);
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to delete file from S3: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string = 'application/octet-stream',
    expiresIn: number = 3600,
  ): Promise<{ uploadUrl: string; publicUrl: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        ContentType: contentType,
        Key: key,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      const publicUrl = this.getPublicUrl(key);

      this.logger.log(`Generated presigned upload URL for ${key}`);
      return { publicUrl, uploadUrl };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to generate presigned URL: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const downloadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      this.logger.log(`Generated presigned download URL for ${key}`);
      return downloadUrl;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to generate presigned download URL: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  generateS3Key(type: string, id: string): string {
    return `ingredients/${type}/${id}`;
  }

  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      const command = new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
      });

      await this.s3Client.send(command);
      this.logger.log(
        `File copied successfully from ${sourceKey} to ${destinationKey}`,
      );
    } catch (error: unknown) {
      const s3Err = error as S3Error;
      const errorMessage = getErrorMessage(error) || 'Unknown error';
      const errorDetails = {
        code: s3Err?.name || s3Err?.code,
        destinationKey,
        message: errorMessage,
        sourceKey,
        statusCode: s3Err?.$metadata?.httpStatusCode || s3Err?.statusCode,
        ...(s3Err?.stack && { stack: s3Err.stack }),
      };
      this.logger.error(
        `Failed to copy file in S3: ${errorMessage}`,
        errorDetails,
      );
      throw error;
    }
  }

  async getFileStream(key: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      return response.Body as Readable;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to get file stream from S3: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  getPublicUrl(key: string): string {
    return `${this.configService.get('GENFEEDAI_CDN_URL')}/${key}`;
  }
}
