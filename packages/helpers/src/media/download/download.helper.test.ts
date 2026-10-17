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
        signal: expect.any(AbortSignal),
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

    describe('stalled downloads', () => {
      const STALL_MS = 600_000;

      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('keeps a slow download alive while bytes keep arriving', async () => {
        let isAborted = false;
        mockFetch.mockImplementation((_url: string, init: RequestInit) => {
          init.signal?.addEventListener('abort', () => {
            isAborted = true;
          });
          return Promise.resolve({
            body: {
              getReader: () => {
                let calls = 0;
                return {
                  read: async () => {
                    calls += 1;
                    if (calls > 3) return { done: true, value: undefined };
                    await vi.advanceTimersByTimeAsync(STALL_MS - 1);
                    return { done: false, value: new Uint8Array([calls]) };
                  },
                };
              },
            },
            headers: { get: () => 'video/mp4' },
            ok: true,
          });
        });

        await downloadUrl('https://example.com/big.mp4', 'big.mp4');

        expect(isAborted).toBe(false);
        const saved = mockSaveAs.mock.calls[0]?.[0] as Blob;
        expect(saved.size).toBe(3);
        expect(saved.type).toBe('video/mp4');
      });

      it('aborts when no bytes arrive for the stall limit', async () => {
        mockFetch.mockImplementation(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError')),
              );
            }),
        );

        const download = downloadUrl('https://example.com/stuck', 'stuck.bin');
        const assertion = expect(download).rejects.toThrow('aborted');
        await vi.advanceTimersByTimeAsync(STALL_MS);
        await assertion;
        expect(mockSaveAs).not.toHaveBeenCalled();
      });
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
    it.each<[IngredientCategory, Partial<IIngredient>, string]>([
      [
        IngredientCategory.VIDEO,
        { metadata: { label: 'My Video' } as IMetadata },
        'My Video-video-ing-123.mp4',
      ],
      [
        IngredientCategory.MUSIC,
        { metadata: { label: 'Track' } as IMetadata },
        'Track-music-ing-123.mp3',
      ],
      [
        IngredientCategory.IMAGE,
        { metadata: {} as IMetadata },
        'genfeed-image-ing-123.jpg',
      ],
    ])('names %s downloads (%j)', (category, fields, expected) => {
      expect(
        ingredientDownloadFilename({
          category,
          id: 'ing-123',
          ...fields,
        } as IIngredient),
      ).toBe(expected);
    });

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
