import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient, IMetadata } from '@genfeedai/contracts/interfaces';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSaveAs } = vi.hoisted(() => ({
  mockSaveAs: vi.fn(),
}));
vi.mock('file-saver', () => ({
  saveAs: mockSaveAs,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockWindowOpen = vi.fn();
global.window = {
  ...global.window,
  open: mockWindowOpen,
} as unknown as Window & typeof globalThis;

import {
  downloadIngredient,
  downloadUrl,
  filenameFromContentDisposition,
  ingredientDownloadFilename,
  sanitizeDownloadFilename,
} from '@helpers/media/download/download.helper';

describe('download.helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('downloadIngredient', () => {
    const createMockIngredient = (
      overrides: Partial<IIngredient> = {},
    ): IIngredient =>
      ({
        category: IngredientCategory.IMAGE,
        id: 'ing-123',
        ingredientUrl: 'https://example.com/image.png',
        metadata: { label: 'Test Image' },
        ...overrides,
      }) as IIngredient;

    it('should throw error when no download URL', async () => {
      const ingredient = createMockIngredient({ ingredientUrl: undefined });

      await expect(
        downloadIngredient(ingredient, ingredient.ingredientUrl ?? ''),
      ).rejects.toThrow('No download URL available');
    });

    it('throws instead of opening a tab when fetch response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const ingredient = createMockIngredient();

      await expect(
        downloadIngredient(ingredient, ingredient.ingredientUrl ?? ''),
      ).rejects.toThrow('Failed to download file (status 404)');
      expect(mockWindowOpen).not.toHaveBeenCalled();
      expect(mockSaveAs).not.toHaveBeenCalled();
    });

    it('should download and save image ingredient', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      mockFetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
        ok: true,
      });

      const ingredient = createMockIngredient();

      await downloadIngredient(ingredient, ingredient.ingredientUrl ?? '');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.png', {
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors',
      });
      expect(mockSaveAs).toHaveBeenCalledWith(
        mockBlob,
        'Test Image-image-ing-123.png',
      );
    });

    it('should download video ingredient', async () => {
      const mockBlob = new Blob(['test'], { type: 'video/mp4' });
      mockFetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
        ok: true,
      });

      const ingredient = createMockIngredient({
        category: IngredientCategory.VIDEO,
        metadata: { label: 'My Video' },
      });

      await downloadIngredient(ingredient, ingredient.ingredientUrl ?? '');

      expect(mockSaveAs).toHaveBeenCalledWith(
        mockBlob,
        'My Video-video-ing-123.mp4',
      );
    });

    it('should use default label when metadata label is missing', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      mockFetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
        ok: true,
      });

      const ingredient = createMockIngredient({ metadata: {} });

      await downloadIngredient(ingredient, ingredient.ingredientUrl ?? '');

      expect(mockSaveAs).toHaveBeenCalledWith(
        mockBlob,
        'genfeed-image-ing-123.png',
      );
    });

    it('should use default label when no metadata', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      mockFetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
        ok: true,
      });

      const ingredient = createMockIngredient({ metadata: undefined });

      await downloadIngredient(ingredient, ingredient.ingredientUrl ?? '');

      expect(mockSaveAs).toHaveBeenCalledWith(
        mockBlob,
        'genfeed-image-ing-123.png',
      );
    });

    it('should download music ingredient', async () => {
      const mockBlob = new Blob(['test'], { type: 'audio/mp3' });
      mockFetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
        ok: true,
      });

      const ingredient = createMockIngredient({
        category: IngredientCategory.MUSIC,
        metadata: { label: 'Track' },
      });

      await downloadIngredient(ingredient, ingredient.ingredientUrl ?? '');

      expect(mockSaveAs).toHaveBeenCalledWith(
        mockBlob,
        'Track-music-ing-123.mp3',
      );
    });

    it('saves original PNG bytes with a png suffix', async () => {
      const pngBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const mockBlob = new Blob([pngBytes], {
        type: 'application/octet-stream',
      });
      mockFetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
        ok: true,
      });

      const ingredient = createMockIngredient();

      await downloadIngredient(ingredient, ingredient.ingredientUrl ?? '');

      const filename = mockSaveAs.mock.calls[0]?.[1] as string;
      expect(filename.endsWith('.jpg')).toBe(false);
      expect(filename).toBe('Test Image-image-ing-123.png');
    });
  });

  describe('downloadUrl', () => {
    it('should download file with custom filename', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      mockFetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
        ok: true,
      });

      await downloadUrl('https://example.com/doc.pdf', 'my-document.pdf');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/doc.pdf', {
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors',
      });
      expect(mockSaveAs).toHaveBeenCalledWith(mockBlob, 'my-document.pdf');
    });

    it('should use default filename when not provided', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/octet-stream' });
      mockFetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
        ok: true,
      });

      await downloadUrl('https://example.com/file');

      expect(mockSaveAs).toHaveBeenCalledWith(mockBlob, 'download');
    });

    it('throws instead of opening a new tab when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        downloadUrl('https://example.com/file', 'file.pdf'),
      ).rejects.toThrow('Network error');
      expect(mockWindowOpen).not.toHaveBeenCalled();
      expect(mockSaveAs).not.toHaveBeenCalled();
    });

    it('throws instead of opening a new tab when response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      await expect(
        downloadUrl('https://example.com/file', 'file.pdf'),
      ).rejects.toThrow('Failed to download file (status 403)');
      expect(mockWindowOpen).not.toHaveBeenCalled();
    });
  });

  describe('filenameFromContentDisposition', () => {
    it('reads a quoted attachment filename', () => {
      expect(
        filenameFromContentDisposition(
          'attachment; filename="image-1-watermarked.png"',
        ),
      ).toBe('image-1-watermarked.png');
    });
  });

  describe('ingredientDownloadFilename', () => {
    it.each<[Partial<IIngredient>, string]>([
      [{ metadataExtension: '.WEBP' }, 'webp'],
      [{ metadata: { extension: 'PNG' } as IMetadata }, 'png'],
      [{ mimeType: 'image/png; charset=binary' }, 'png'],
      [{ metadataExtension: '../invalid' }, 'jpg'],
      [{}, 'jpg'],
    ])('preserves validated image formats (%j)', (fields, extension) => {
      expect(
        ingredientDownloadFilename({
          category: IngredientCategory.IMAGE,
          id: 'ing-123',
          ...fields,
        } as IIngredient),
      ).toBe(`genfeed-image-ing-123.${extension}`);
    });

    it('keeps the id and extension when the label is a long prompt', () => {
      const filename = sanitizeDownloadFilename(
        ingredientDownloadFilename({
          category: IngredientCategory.IMAGE,
          id: 'ing-123',
          metadata: { extension: 'png', label: 'a'.repeat(400) } as IMetadata,
        } as IIngredient),
      );

      expect(filename.endsWith('-image-ing-123.png')).toBe(true);
    });

    it('saves PNG bytes with a png suffix when the declared type is jpeg', () => {
      const pngBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const filename = ingredientDownloadFilename(
        {
          category: IngredientCategory.IMAGE,
          id: 'ing-123',
        } as IIngredient,
        'image/jpeg',
        pngBytes,
      );

      expect(filename.endsWith('.jpg')).toBe(false);
      expect(filename).toBe('genfeed-image-ing-123.png');
    });

    it.each<[Uint8Array, string]>([
      [new Uint8Array([0xff, 0xd8, 0xff, 0x00]), 'jpg'],
      [
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
          0x50,
        ]),
        'webp',
      ],
      [new Uint8Array([1, 2, 3, 4]), 'jpg'],
    ])(
      'uses trusted original bytes or the jpg fallback',
      (bytes, extension) => {
        expect(
          ingredientDownloadFilename(
            {
              category: IngredientCategory.IMAGE,
              id: 'ing-123',
            } as IIngredient,
            'application/octet-stream',
            bytes,
          ),
        ).toBe(`genfeed-image-ing-123.${extension}`);
      },
    );

    it('uses the downloaded bytes MIME type ahead of stale metadata', () => {
      expect(
        ingredientDownloadFilename(
          {
            category: IngredientCategory.IMAGE,
            id: 'ing-123',
            metadataExtension: 'jpg',
            mimeType: 'image/jpeg',
          } as IIngredient,
          'image/png',
        ),
      ).toBe('genfeed-image-ing-123.png');
    });

    it('builds a stable download name from the ingredient', () => {
      expect(
        ingredientDownloadFilename({
          category: IngredientCategory.IMAGE,
          id: 'ing-123',
          metadata: { label: 'Test Image' },
          mimeType: 'image/png',
        } as IIngredient),
      ).toBe('Test Image-image-ing-123.png');
    });
  });
});
