import { resolveUploadExtension } from '@api/services/uploads/upload-extension.util';

describe('resolveUploadExtension', () => {
  it.each([
    ['image/jpeg', 'photo.jpg', 'JPEG'],
    ['image/png', 'photo.png', 'PNG'],
    ['image/webp', 'photo.webp', 'WEBP'],
    ['video/mp4', 'clip.mp4', 'MP4'],
    ['audio/mpeg', 'track.mp3', 'MP3'],
  ])('maps %s to the %s label', (contentType, filename, expected) => {
    expect(resolveUploadExtension(contentType, filename)).toBe(expected);
  });

  it('trusts the content type over a mismatched filename', () => {
    expect(resolveUploadExtension('image/png', 'photo.jpg')).toBe('PNG');
    expect(resolveUploadExtension('image/jpeg', 'noextension')).toBe('JPEG');
  });

  it('is case-insensitive on the content type', () => {
    expect(resolveUploadExtension('IMAGE/JPEG', 'photo.jpg')).toBe('JPEG');
  });

  it('falls back to the filename extension for an unmapped content type', () => {
    expect(resolveUploadExtension('application/pdf', 'document.pdf')).toBe(
      'pdf',
    );
  });

  it('defaults to jpg when nothing identifies the file', () => {
    expect(resolveUploadExtension('application/octet-stream', 'noext')).toBe(
      'jpg',
    );
  });
});
