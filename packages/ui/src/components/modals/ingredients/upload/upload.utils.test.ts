import { describe, expect, it } from 'vitest';
import {
  getAcceptedTypes,
  isHeicUpload,
  normalizeUploadFile,
} from './upload.utils';

function readBytes(file: File): Promise<string | ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

describe('Library upload declarations', () => {
  it('adds HEIC and HEIF only to Library IMAGE acceptance', () => {
    expect(getAcceptedTypes(true, false, false, true)).toEqual([
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.gif',
      '.heic',
      '.heif',
    ]);
    expect(getAcceptedTypes(true, false, false)).toEqual([
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.gif',
    ]);
    expect(getAcceptedTypes(false, true, false, true)).toEqual([
      '.mp4',
      '.avi',
      '.mov',
      '.mkv',
      '.webm',
    ]);
    expect(getAcceptedTypes(false, false, true, true)).toEqual([
      '.mp3',
      '.wav',
      '.aac',
      '.flac',
      '.ogg',
    ]);
  });

  it.each([
    ['Portrait.HEIC', 'Portrait.heic', 'image/heic'],
    ['Portrait.HeIf', 'Portrait.heif', 'image/heif'],
  ])(
    'infers empty MIME for terminal %s and preserves original bytes and timestamp',
    async (name, normalizedName, type) => {
      const original = new File([new Uint8Array([0, 255, 17, 42])], name, {
        lastModified: 123456,
      });
      const normalized = normalizeUploadFile(original, true);
      expect(normalized.name).toBe(normalizedName);
      expect(normalized.type).toBe(type);
      expect(normalized.lastModified).toBe(original.lastModified);
      expect(normalized.size).toBe(original.size);
      expect(((await readBytes(normalized)) as string).split(',')[1]).toBe(
        ((await readBytes(original)) as string).split(',')[1],
      );
    },
  );

  it.each(['image/jpeg', 'application/octet-stream', 'image/heif'])(
    'preserves explicit %s rather than guessing MIME from suffix',
    (type) => {
      const original = new File(['bytes'], 'phone.heic', { type });
      expect(normalizeUploadFile(original, true)).toBe(original);
      expect(normalizeUploadFile(original, true).type).toBe(type);
    },
  );

  it.each([
    'phone.heic.backup',
    'phone.heif?download',
    'phone.heics',
    'phone',
    'phone.avif',
  ])('does not infer MIME for nonterminal or unknown %s', (name) => {
    expect(normalizeUploadFile(new File(['bytes'], name), true).type).toBe('');
  });

  it('does not infer HEIC MIME for asset or nonimage callers', () => {
    expect(
      normalizeUploadFile(new File(['bytes'], 'photo.HEIC'), false).type,
    ).toBe('');
  });

  it.each(['jpeg', 'png', 'webp', 'gif', 'mp3', 'mp4'])(
    'retains ordinary %s file declarations and clone identity when already normalized',
    (extension) => {
      const file = new File(['bytes'], `media.${extension}`, {
        lastModified: 200,
        type: `application/${extension}`,
      });
      expect(normalizeUploadFile(file, true)).toBe(file);
      const uppercase = new File([file], `media.${extension.toUpperCase()}`, {
        lastModified: file.lastModified,
        type: file.type,
      });
      const normalized = normalizeUploadFile(uppercase, true);
      expect(normalized.name).toBe(file.name);
      expect(normalized.type).toBe(file.type);
      expect(normalized.lastModified).toBe(file.lastModified);
    },
  );

  it('recognizes HEIC preview declarations without treating unrelated files as HEIC', () => {
    expect(isHeicUpload(new File(['bytes'], 'photo.HEIF'))).toBe(true);
    expect(
      isHeicUpload(new File(['bytes'], 'photo', { type: 'image/heic' })),
    ).toBe(true);
    expect(
      isHeicUpload(
        new File(['bytes'], 'photo.heic.jpeg', { type: 'image/jpeg' }),
      ),
    ).toBe(false);
  });
});
