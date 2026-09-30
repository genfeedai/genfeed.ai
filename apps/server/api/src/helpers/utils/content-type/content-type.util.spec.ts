import { ContentTypeUtil } from '@api/helpers/utils/content-type/content-type.util';

describe('ContentTypeUtil', () => {
  describe('getContentType', () => {
    it('should return correct content type for image files', () => {
      expect(ContentTypeUtil.getContentType('test.jpg')).toBe('image/jpeg');
      expect(ContentTypeUtil.getContentType('test.jpeg')).toBe('image/jpeg');
      expect(ContentTypeUtil.getContentType('test.png')).toBe('image/png');
      expect(ContentTypeUtil.getContentType('test.webp')).toBe('image/webp');
      expect(ContentTypeUtil.getContentType('test.gif')).toBe('image/gif');
    });

    it('should return correct content type for video files', () => {
      expect(ContentTypeUtil.getContentType('test.mp4')).toBe('video/mp4');
      expect(ContentTypeUtil.getContentType('test.avi')).toBe(
        'video/x-msvideo',
      );
      expect(ContentTypeUtil.getContentType('test.mov')).toBe(
        'video/quicktime',
      );
      expect(ContentTypeUtil.getContentType('test.webm')).toBe('video/webm');
    });

    it('should return correct content type for audio files', () => {
      expect(ContentTypeUtil.getContentType('test.mp3')).toBe('audio/mpeg');
      expect(ContentTypeUtil.getContentType('test.wav')).toBe('audio/wav');
      expect(ContentTypeUtil.getContentType('test.flac')).toBe('audio/flac');
      expect(ContentTypeUtil.getContentType('test.aac')).toBe('audio/aac');
    });

    it('should return correct content type for document files', () => {
      expect(ContentTypeUtil.getContentType('test.pdf')).toBe(
        'application/pdf',
      );
      expect(ContentTypeUtil.getContentType('test.doc')).toBe(
        'application/msword',
      );
      expect(ContentTypeUtil.getContentType('test.docx')).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(ContentTypeUtil.getContentType('test.xls')).toBe(
        'application/vnd.ms-excel',
      );
      expect(ContentTypeUtil.getContentType('test.xlsx')).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });

    it('should handle uppercase extensions', () => {
      expect(ContentTypeUtil.getContentType('TEST.PNG')).toBe('image/png');
      expect(ContentTypeUtil.getContentType('VIDEO.MP4')).toBe('video/mp4');
    });

    it('should handle mixed case extensions', () => {
      expect(ContentTypeUtil.getContentType('test.JpG')).toBe('image/jpeg');
      expect(ContentTypeUtil.getContentType('test.Mp4')).toBe('video/mp4');
    });

    it('should return default content type for unknown extensions', () => {
      expect(ContentTypeUtil.getContentType('test.unknown')).toBe(
        'application/octet-stream',
      );
      expect(ContentTypeUtil.getContentType('noextension')).toBe(
        'application/octet-stream',
      );
    });

    it('should handle paths with directories', () => {
      expect(ContentTypeUtil.getContentType('/path/to/file.jpg')).toBe(
        'image/jpeg',
      );
      expect(ContentTypeUtil.getContentType('path/to/file.mp4')).toBe(
        'video/mp4',
      );
    });
  });

  describe('isImage', () => {
    it('should return true for image files', () => {
      expect(ContentTypeUtil.isImage('test.jpg')).toBe(true);
      expect(ContentTypeUtil.isImage('test.png')).toBe(true);
      expect(ContentTypeUtil.isImage('test.gif')).toBe(true);
      expect(ContentTypeUtil.isImage('test.webp')).toBe(true);
    });

    it('should return false for non-image files', () => {
      expect(ContentTypeUtil.isImage('test.mp4')).toBe(false);
      expect(ContentTypeUtil.isImage('test.pdf')).toBe(false);
      expect(ContentTypeUtil.isImage('test.mp3')).toBe(false);
      expect(ContentTypeUtil.isImage('test.txt')).toBe(false);
    });
  });

  describe('isVideo', () => {
    it('should return true for video files', () => {
      expect(ContentTypeUtil.isVideo('test.mp4')).toBe(true);
      expect(ContentTypeUtil.isVideo('test.avi')).toBe(true);
      expect(ContentTypeUtil.isVideo('test.mov')).toBe(true);
      expect(ContentTypeUtil.isVideo('test.webm')).toBe(true);
    });

    it('should return false for non-video files', () => {
      expect(ContentTypeUtil.isVideo('test.jpg')).toBe(false);
      expect(ContentTypeUtil.isVideo('test.pdf')).toBe(false);
      expect(ContentTypeUtil.isVideo('test.mp3')).toBe(false);
    });
  });

  describe('isAudio', () => {
    it('should return true for audio files', () => {
      expect(ContentTypeUtil.isAudio('test.mp3')).toBe(true);
      expect(ContentTypeUtil.isAudio('test.wav')).toBe(true);
      expect(ContentTypeUtil.isAudio('test.flac')).toBe(true);
      expect(ContentTypeUtil.isAudio('test.aac')).toBe(true);
    });

    it('should return false for non-audio files', () => {
      expect(ContentTypeUtil.isAudio('test.jpg')).toBe(false);
      expect(ContentTypeUtil.isAudio('test.mp4')).toBe(false);
      expect(ContentTypeUtil.isAudio('test.pdf')).toBe(false);
    });
  });

  describe('isDocument', () => {
    it('should return true for document files', () => {
      expect(ContentTypeUtil.isDocument('test.pdf')).toBe(true);
      expect(ContentTypeUtil.isDocument('test.doc')).toBe(true);
      expect(ContentTypeUtil.isDocument('test.docx')).toBe(true);
      expect(ContentTypeUtil.isDocument('test.xls')).toBe(true);
      expect(ContentTypeUtil.isDocument('test.xlsx')).toBe(true);
      expect(ContentTypeUtil.isDocument('test.ppt')).toBe(true);
      expect(ContentTypeUtil.isDocument('test.pptx')).toBe(true);
    });

    it('should return false for non-document files', () => {
      expect(ContentTypeUtil.isDocument('test.jpg')).toBe(false);
      expect(ContentTypeUtil.isDocument('test.mp4')).toBe(false);
      expect(ContentTypeUtil.isDocument('test.mp3')).toBe(false);
      expect(ContentTypeUtil.isDocument('test.txt')).toBe(false);
    });
  });

  describe('getFileCategory', () => {
    it('should return image category for image files', () => {
      expect(ContentTypeUtil.getFileCategory('test.jpg')).toBe('image');
      expect(ContentTypeUtil.getFileCategory('test.png')).toBe('image');
    });

    it('should return video category for video files', () => {
      expect(ContentTypeUtil.getFileCategory('test.mp4')).toBe('video');
      expect(ContentTypeUtil.getFileCategory('test.avi')).toBe('video');
    });

    it('should return audio category for audio files', () => {
      expect(ContentTypeUtil.getFileCategory('test.mp3')).toBe('audio');
      expect(ContentTypeUtil.getFileCategory('test.wav')).toBe('audio');
    });

    it('should return document category for document files', () => {
      expect(ContentTypeUtil.getFileCategory('test.pdf')).toBe('document');
      expect(ContentTypeUtil.getFileCategory('test.docx')).toBe('document');
    });

    it('should return text category for text files', () => {
      expect(ContentTypeUtil.getFileCategory('test.txt')).toBe('text');
      expect(ContentTypeUtil.getFileCategory('test.csv')).toBe('text');
      expect(ContentTypeUtil.getFileCategory('test.html')).toBe('text');
    });

    it('should return archive category for archive files', () => {
      expect(ContentTypeUtil.getFileCategory('test.zip')).toBe('archive');
      expect(ContentTypeUtil.getFileCategory('test.rar')).toBe('archive');
      expect(ContentTypeUtil.getFileCategory('test.7z')).toBe('archive');
    });

    it('should return other for unknown files', () => {
      expect(ContentTypeUtil.getFileCategory('test.unknown')).toBe('other');
    });
  });

  describe('getExtensionForContentType', () => {
    it('should return correct extension for content types', () => {
      expect(ContentTypeUtil.getExtensionForContentType('image/jpeg')).toBe(
        '.jpeg',
      );
      expect(ContentTypeUtil.getExtensionForContentType('image/png')).toBe(
        '.png',
      );
      expect(ContentTypeUtil.getExtensionForContentType('video/mp4')).toBe(
        '.mp4',
      );
      expect(ContentTypeUtil.getExtensionForContentType('audio/mpeg')).toBe(
        '.mp3',
      );
      expect(
        ContentTypeUtil.getExtensionForContentType('application/pdf'),
      ).toBe('.pdf');
    });

    it('should return null for unknown content types', () => {
      expect(
        ContentTypeUtil.getExtensionForContentType('application/unknown'),
      ).toBeNull();
      expect(
        ContentTypeUtil.getExtensionForContentType('unknown/type'),
      ).toBeNull();
    });
  });

  describe('isAllowedExtension', () => {
    it('should return true for allowed extensions', () => {
      expect(
        ContentTypeUtil.isAllowedExtension('test.jpg', ['.jpg', '.png']),
      ).toBe(true);
      expect(
        ContentTypeUtil.isAllowedExtension('test.png', ['.jpg', '.png']),
      ).toBe(true);
    });

    it('should return false for disallowed extensions', () => {
      expect(
        ContentTypeUtil.isAllowedExtension('test.gif', ['.jpg', '.png']),
      ).toBe(false);
      expect(
        ContentTypeUtil.isAllowedExtension('test.mp4', ['.jpg', '.png']),
      ).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(
        ContentTypeUtil.isAllowedExtension('test.JPG', ['.jpg', '.png']),
      ).toBe(true);
      expect(
        ContentTypeUtil.isAllowedExtension('test.jpg', ['.JPG', '.PNG']),
      ).toBe(true);
      expect(
        ContentTypeUtil.isAllowedExtension('TEST.PNG', ['.jpg', '.png']),
      ).toBe(true);
    });

    it('should handle paths with directories', () => {
      expect(
        ContentTypeUtil.isAllowedExtension('/path/to/test.jpg', [
          '.jpg',
          '.png',
        ]),
      ).toBe(true);
    });

    it('should handle files without extension', () => {
      expect(
        ContentTypeUtil.isAllowedExtension('noextension', ['.jpg', '.png']),
      ).toBe(false);
    });
  });
});
