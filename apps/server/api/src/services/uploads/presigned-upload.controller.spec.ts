import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRESIGNED_UPLOAD_CONTROLLER_PATHS,
  PresignedUploadController,
} from '@api/services/uploads/presigned-upload.controller';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

describe('PresignedUploadController', () => {
  it('mounts presigned upload on the client bases that lack it', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, PresignedUploadController),
    ).toEqual([...PRESIGNED_UPLOAD_CONTROLLER_PATHS]);
    expect(PRESIGNED_UPLOAD_CONTROLLER_PATHS).toContain('ingredients');
    expect(PRESIGNED_UPLOAD_CONTROLLER_PATHS).not.toContain('images');
  });

  it('posts the presigned grant and the confirm call the client already uses', () => {
    const presigned = PresignedUploadController.prototype.generatePresignedUrl;
    const confirm = PresignedUploadController.prototype.confirmUpload;

    expect(Reflect.getMetadata(PATH_METADATA, presigned)).toBe(
      'upload/presigned',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, presigned)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, confirm)).toBe(
      'upload/confirm/:id',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, confirm)).toBe(
      RequestMethod.POST,
    );
  });

  it('is registered on the API collections module', () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../app-collections.module.ts',
      ),
      'utf8',
    );

    expect(source).toContain('PresignedUploadHttpModule');
  });
});
