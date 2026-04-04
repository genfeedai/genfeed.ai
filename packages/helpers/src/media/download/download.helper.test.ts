import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock file-saver
const { mockSaveAs } = vi.hoisted(() => ({
  mockSaveAs: vi.fn(),
}));
vi.mock('file-saver', () => ({
  saveAs: mockSaveAs,
}));

// Mock ingredient type util
vi.mock('@utils/media/ingredient-type.util', () => ({
  getIngredientExtension: vi.fn((ingredient: IIngredient) => {
    if (ingredient.category === IngredientCategory.VIDEO) {
      return 'mp4';
    }
    if (ingredient.category === IngredientCategory.IMAGE) {
      return 'png';
    }
    if (ingredient.category === IngredientCategory.MUSIC) {
      return 'mp3';
    }
    return 'bin';
  }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.open
const mockWindowOpen = vi.fn();
global.window = {
  ...global.window,
  open: mockWindowOpen,
} as unknown as Window & typeof globalThis;

// Mock document for DOM fallback in downloadIngredient
const mockLink = {
  click: vi.fn(),
  download: '',
  href: '',
  rel: '',
  target: '',
};
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
global.document = {
  ...global.document,
  body: {
    ...global.document?.body,
    appendChild: mockAppendChild,
    removeChild: mockRemoveChild,
  } as unknown as HTMLElement,
  createElement: vi.fn(() => mockLink),
} as unknown as Document;

import {
  downloadIngredient,
  downloadUrl,
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

      await expect(downloadIngredient(ingredient)).rejects.toThrow(
        'No download URL available',
      );
    });

    it('should fallback to anchor element when fetch response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const ingredient = createMockIngredient();

      await downloadIngredient(ingredient);

      expect(global.document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('should download and save image ingredient', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      mockFetch.mockResolvedValue({
        blob: () => Promise.resolve(mockBlob),
        ok: true,
      });

      const ingredient = createMockIngredient();

      await downloadIngredient(ingredient);

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.png');
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

      await downloadIngredient(ingredient);

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

      await downloadIngredient(ingredient);

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

      await downloadIngredient(ingredient);

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

      await downloadIngredient(ingredient);

      expect(mockSaveAs).toHaveBeenCalledWith(
        mockBlob,
        'Track-music-ing-123.mp3',
      );
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

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/doc.pdf');
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

    it('should open in new tab when fetch fails with error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await downloadUrl('https://example.com/file', 'file.pdf');

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://example.com/file',
        '_blank',
        'noopener,noreferrer',
      );
    });

    it('should open in new tab when response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      await downloadUrl('https://example.com/file', 'file.pdf');

      expect(mockWindowOpen).toHaveBeenCalledWith(
        'https://example.com/file',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });
});
