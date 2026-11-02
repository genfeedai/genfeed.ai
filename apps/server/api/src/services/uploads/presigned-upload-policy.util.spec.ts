import {
  assertPresignedUploadAllowed,
  inferDirectUploadCategory,
  isImageOrVideoCategory,
  resolveDirectUploadCategory,
  resolveUploadMaxBytes,
} from '@api/services/uploads/presigned-upload-policy.util';
import { IngredientCategory } from '@genfeedai/contracts';

describe('presigned upload policy', () => {
  it.each([
    [IngredientCategory.IMAGE, 'image/jpeg'],
    [IngredientCategory.IMAGE, 'image/png'],
    [IngredientCategory.IMAGE, 'IMAGE/WEBP'],
    [IngredientCategory.IMAGE, 'image/gif'],
    [IngredientCategory.IMAGE, 'image/heic'],
    [IngredientCategory.IMAGE, 'image/heif'],
    [IngredientCategory.IMAGE, 'image/png; charset=binary'],
    [IngredientCategory.VIDEO, 'video/mp4'],
    [IngredientCategory.VIDEO, 'video/quicktime'],
    [IngredientCategory.VOICE, 'audio/mpeg'],
    [IngredientCategory.MUSIC, 'audio/wav'],
  ])('allows %s uploads of %s', (category, contentType) => {
    expect(
      assertPresignedUploadAllowed({ category, contentType, sizeBytes: 1024 }),
    ).toBe(contentType.split(';')[0].toLowerCase());
  });

  it.each([
    [IngredientCategory.IMAGE, 'text/html'],
    [IngredientCategory.IMAGE, 'image/svg+xml'],
    [IngredientCategory.IMAGE, 'application/x-msdownload'],
    [IngredientCategory.IMAGE, 'video/mp4'],
    [IngredientCategory.VIDEO, 'application/octet-stream'],
    [IngredientCategory.AUDIO, 'image/png'],
  ])('rejects %s uploads of %s with 415', (category, contentType) => {
    expect(() =>
      assertPresignedUploadAllowed({ category, contentType }),
    ).toThrow(expect.objectContaining({ status: 415 }));
  });

  it.each([undefined, null, 42, ''])('rejects a %s content type', (value) => {
    expect(() =>
      assertPresignedUploadAllowed({
        category: IngredientCategory.IMAGE,
        contentType: value,
      }),
    ).toThrow(expect.objectContaining({ status: 415 }));
  });

  it.each([
    ['image/gif', IngredientCategory.GIF],
    ['image/jpeg', IngredientCategory.IMAGE],
    ['image/png; charset=binary', IngredientCategory.IMAGE],
    ['image/heic', IngredientCategory.IMAGE],
    ['video/mp4', IngredientCategory.VIDEO],
    ['audio/mpeg', IngredientCategory.MUSIC],
    ['text/plain', undefined],
  ])('infers %s as %s', (contentType, category) => {
    expect(inferDirectUploadCategory(contentType)).toBe(category);
  });

  it('keeps an explicit category and infers a generic ingredient', () => {
    expect(
      resolveDirectUploadCategory(IngredientCategory.IMAGE, 'image/gif'),
    ).toBe(IngredientCategory.IMAGE);
    expect(
      resolveDirectUploadCategory(IngredientCategory.VOICE, 'audio/mpeg'),
    ).toBe(IngredientCategory.VOICE);
    expect(
      resolveDirectUploadCategory(IngredientCategory.INGREDIENT, 'image/jpeg'),
    ).toBe(IngredientCategory.IMAGE);
    expect(resolveDirectUploadCategory(undefined, 'image/png')).toBe(
      IngredientCategory.IMAGE,
    );
    expect(
      resolveDirectUploadCategory(IngredientCategory.INGREDIENT, 'text/plain'),
    ).toBe(IngredientCategory.INGREDIENT);
  });

  it('rejects categories without a direct-upload policy', () => {
    expect(() =>
      assertPresignedUploadAllowed({
        category: IngredientCategory.TEXT,
        contentType: 'text/plain',
      }),
    ).toThrow(expect.objectContaining({ status: 400 }));
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects size %s', (sizeBytes) => {
    expect(() =>
      assertPresignedUploadAllowed({
        category: IngredientCategory.IMAGE,
        contentType: 'image/png',
        sizeBytes,
      }),
    ).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('enforces the per-category cap with 413 and honors an override', () => {
    const over = 101 * 1024 * 1024;
    expect(() =>
      assertPresignedUploadAllowed({
        category: IngredientCategory.VIDEO,
        contentType: 'video/mp4',
        sizeBytes: over,
      }),
    ).toThrow(expect.objectContaining({ status: 413 }));
    expect(
      assertPresignedUploadAllowed({
        category: IngredientCategory.VIDEO,
        contentType: 'video/mp4',
        maxBytesOverride: 10 * 1024 * 1024 * 1024,
        sizeBytes: over,
      }),
    ).toBe('video/mp4');
  });

  it('exposes caps and the media-dimension rule', () => {
    expect(resolveUploadMaxBytes(IngredientCategory.IMAGE)).toBe(
      50 * 1024 * 1024,
    );
    expect(resolveUploadMaxBytes(IngredientCategory.TEXT)).toBeUndefined();
    expect(isImageOrVideoCategory(IngredientCategory.GIF)).toBe(true);
    expect(isImageOrVideoCategory(IngredientCategory.VOICE)).toBe(false);
  });
});
