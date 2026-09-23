import { withoutClientStorageIdentity } from '@api/helpers/utils/client-storage-identity/client-storage-identity.util';
import { describe, expect, it } from 'vitest';

describe('withoutClientStorageIdentity', () => {
  it('drops s3Key and cdnUrl and keeps every other field', () => {
    const input = {
      cdnUrl: 'https://cdn.genfeed.ai/ingredients/images/other-tenant.png',
      folderId: 'folder-1',
      label: 'Renamed',
      s3Key: 'ingredients/images/other-tenant.png',
    };

    expect(withoutClientStorageIdentity(input)).toEqual({
      folderId: 'folder-1',
      label: 'Renamed',
    });
  });

  it('does not mutate the input', () => {
    const input = { label: 'x', s3Key: 'ingredients/images/a.png' };
    withoutClientStorageIdentity(input);
    expect(input.s3Key).toBe('ingredients/images/a.png');
  });

  it('keeps explicit null values for other fields', () => {
    expect(withoutClientStorageIdentity({ folderId: null })).toEqual({
      folderId: null,
    });
  });
});
