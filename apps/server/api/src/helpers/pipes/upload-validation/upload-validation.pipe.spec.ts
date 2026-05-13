import { BadRequestException } from '@nestjs/common';
import { UploadValidationPipe } from './upload-validation.pipe';

function makeFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    buffer: Buffer.from('fake'),
    destination: '',
    encoding: '7bit',
    fieldname: 'file',
    filename: '',
    mimetype: 'image/jpeg',
    originalname: 'photo.jpg',
    path: '',
    size: 1024,
    stream: null as unknown as NodeJS.ReadableStream,
    ...overrides,
  };
}

describe('UploadValidationPipe', () => {
  describe('default options', () => {
    let pipe: UploadValidationPipe;

    beforeEach(() => {
      pipe = new UploadValidationPipe();
    });

    it('should be defined', () => {
      expect(pipe).toBeDefined();
    });

    it('should pass through a valid file', () => {
      const file = makeFile({
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
        size: 100,
      });
      expect(pipe.transform(file)).toBe(file);
    });

    it('should throw BadRequestException when file is missing and required (default)', () => {
      expect(() =>
        pipe.transform(null as unknown as Express.Multer.File),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when file size exceeds 50MB default', () => {
      const file = makeFile({ size: 51 * 1024 * 1024 });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when MIME type is not in the default allow-list', () => {
      const file = makeFile({
        mimetype: 'application/x-binary',
        originalname: 'exploit.bin',
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });
  });

  describe('custom options', () => {
    it('should enforce custom maxSizeBytes', () => {
      const pipe = new UploadValidationPipe({ maxSizeBytes: 1024 });
      const oversized = makeFile({ size: 2048 });
      expect(() => pipe.transform(oversized)).toThrow(BadRequestException);
    });

    it('should allow files within custom maxSizeBytes', () => {
      const pipe = new UploadValidationPipe({ maxSizeBytes: 5 * 1024 * 1024 });
      const file = makeFile({ size: 1 * 1024 * 1024 });
      expect(pipe.transform(file)).toBe(file);
    });

    it('should enforce custom allowedMimeTypes', () => {
      const pipe = new UploadValidationPipe({
        allowedMimeTypes: ['video/mp4'],
      });
      const file = makeFile({ mimetype: 'image/jpeg' });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });

    it('should pass file with allowed MIME type', () => {
      const pipe = new UploadValidationPipe({
        allowedMimeTypes: ['video/mp4'],
      });
      const file = makeFile({
        mimetype: 'video/mp4',
        originalname: 'clip.mp4',
      });
      expect(pipe.transform(file)).toBe(file);
    });

    it('should enforce allowedExtensions when provided', () => {
      const pipe = new UploadValidationPipe({
        allowedExtensions: ['mp4'],
        allowedMimeTypes: ['video/mp4'],
      });
      const file = makeFile({
        mimetype: 'video/mp4',
        originalname: 'clip.avi',
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });

    it('should pass when extension is in the allowed list', () => {
      const pipe = new UploadValidationPipe({
        allowedExtensions: ['mp4'],
        allowedMimeTypes: ['video/mp4'],
      });
      const file = makeFile({
        mimetype: 'video/mp4',
        originalname: 'clip.mp4',
      });
      expect(pipe.transform(file)).toBe(file);
    });

    it('should throw when extension cannot be determined and allowedExtensions is set', () => {
      const pipe = new UploadValidationPipe({
        allowedExtensions: ['mp4'],
        allowedMimeTypes: ['video/mp4'],
      });
      const file = makeFile({
        mimetype: 'video/mp4',
        originalname: 'noextension',
      });
      expect(() => pipe.transform(file)).toThrow(BadRequestException);
    });
  });

  describe('required: false', () => {
    it('should return the file as-is when not provided and required is false', () => {
      const pipe = new UploadValidationPipe({ required: false });
      const result = pipe.transform(null as unknown as Express.Multer.File);
      expect(result).toBeNull();
    });

    it('should still validate size and MIME type when file is provided', () => {
      const pipe = new UploadValidationPipe({
        allowedMimeTypes: ['audio/mpeg'],
        maxSizeBytes: 1024,
        required: false,
      });
      const oversized = makeFile({
        mimetype: 'audio/mpeg',
        originalname: 'audio.mp3',
        size: 2048,
      });
      expect(() => pipe.transform(oversized)).toThrow(BadRequestException);
    });
  });

  describe('error messages', () => {
    it('should include file size info in the size error message', () => {
      const pipe = new UploadValidationPipe({ maxSizeBytes: 1024 });
      const file = makeFile({ size: 2048 });
      try {
        pipe.transform(file);
        fail('should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse() as {
          message: string;
        };
        expect(response.message).toContain('MB');
      }
    });

    it('should include MIME type in the mime error message', () => {
      const pipe = new UploadValidationPipe({
        allowedMimeTypes: ['image/png'],
      });
      const file = makeFile({ mimetype: 'image/gif' });
      try {
        pipe.transform(file);
        fail('should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse() as {
          message: string;
        };
        expect(response.message).toContain('image/gif');
      }
    });
  });
});
