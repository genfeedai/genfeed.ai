import {
  resolveUploadExtension,
  resolveUploadLabel,
} from '@api/services/uploads/upload-extension.util';

describe('resolveUploadExtension', () => {
  it.each([
    ['image/jpeg', 'photo.jpg', 'JPEG'],
    ['image/png', 'photo.png', 'PNG'],
    ['image/webp', 'photo.webp', 'WEBP'],
    ['image/svg+xml', 'logo.svg', 'PNG'],
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

describe('resolveUploadLabel', () => {
  it.each([
    ['image/svg+xml', 'qa-logo.svg', 'qa-logo.png'],
    ['image/svg+xml', 'LOGO.SVG', 'LOGO.png'],
    ['image/svg+xml', 'logo', 'logo'],
    ['image/png', 'photo.svg', 'photo.svg'],
    ['image/jpeg', 'photo.jpg', 'photo.jpg'],
  ])('labels %s upload %s as %s', (contentType, filename, expected) => {
    expect(resolveUploadLabel(contentType, filename)).toBe(expected);
  });
});
