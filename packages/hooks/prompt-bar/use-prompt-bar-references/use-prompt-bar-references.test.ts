import { IngredientFormat, ModelCategory } from '@genfeedai/enums';
import { usePromptBarReferences } from '@hooks/prompt-bar/use-prompt-bar-references/use-prompt-bar-references';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMockForm = () => ({
  formState: { isValid: true },
  getValues: vi.fn(),
  setValue: vi.fn(),
  watch: vi.fn(),
});

const createMockNotificationsService = () => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
});

const createMockAsset = (overrides = {}) => ({
  id: 'asset-1',
  ingredientUrl: 'https://example.com/image.jpg',
  metadataHeight: 1080,
  metadataWidth: 1920,
  ...overrides,
});

const createBaseOptions = () => ({
  currentFormat: IngredientFormat.LANDSCAPE,
  currentModelCategory: ModelCategory.VIDEO,
  form: createMockForm(),
  maxReferenceCount: 1,
  notificationsService: createMockNotificationsService(),
  selectedBrand: null,
  supportsMultipleReferences: false,
});

describe('usePromptBarReferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('initializes with empty references', () => {
      const { result } = renderHook(() =>
        usePromptBarReferences(createBaseOptions()),
      );

      expect(result.current.references).toEqual([]);
      expect(result.current.referenceSource).toBe('');
      expect(result.current.endFrame).toBeNull();
    });

    it('provides refs for tracking state', () => {
      const { result } = renderHook(() =>
        usePromptBarReferences(createBaseOptions()),
      );

      expect(result.current.isUserSelectingReferencesRef.current).toBe(false);
      expect(result.current.hasInitializedReferencesRef.current).toBe(false);
    });
  });

  describe('Single Reference Selection', () => {
    it('selects a single reference when supportsMultipleReferences is false', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarReferences(options));

      const asset = createMockAsset();

      act(() => {
        result.current.handleReferenceSelect(asset);
      });

      expect(result.current.references).toHaveLength(1);
      expect(result.current.references[0].id).toBe('asset-1');
      expect(result.current.referenceSource).toBe('ingredient');
      expect(options.form.setValue).toHaveBeenCalledWith(
        'references',
        ['asset-1'],
        { shouldValidate: true },
      );
    });

    it('replaces existing reference with new one', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarReferences(options));

      const asset1 = createMockAsset({ id: 'asset-1' });
      const asset2 = createMockAsset({ id: 'asset-2' });

      act(() => {
        result.current.handleReferenceSelect(asset1);
      });

      act(() => {
        result.current.handleReferenceSelect(asset2);
      });

      expect(result.current.references).toHaveLength(1);
      expect(result.current.references[0].id).toBe('asset-2');
    });

    it('clears references when null is passed', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarReferences(options));

      const asset = createMockAsset();

      act(() => {
        result.current.handleReferenceSelect(asset);
      });

      act(() => {
        result.current.handleReferenceSelect(null);
      });

      expect(result.current.references).toHaveLength(0);
      expect(result.current.referenceSource).toBe('');
      expect(options.form.setValue).toHaveBeenLastCalledWith('references', [], {
        shouldValidate: true,
      });
    });

    it('handles array with single item same as single item', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarReferences(options));

      const asset = createMockAsset();

      act(() => {
        result.current.handleReferenceSelect([asset]);
      });

      expect(result.current.references).toHaveLength(1);
      expect(result.current.references[0].id).toBe('asset-1');
    });
  });

  describe('Multiple Reference Selection', () => {
    it('allows multiple references when supportsMultipleReferences is true', () => {
      const options = {
        ...createBaseOptions(),
        maxReferenceCount: 5,
        supportsMultipleReferences: true,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const assets = [
        createMockAsset({ id: 'asset-1' }),
        createMockAsset({ id: 'asset-2' }),
        createMockAsset({ id: 'asset-3' }),
      ];

      act(() => {
        result.current.handleReferenceSelect(assets);
      });

      expect(result.current.references).toHaveLength(3);
      expect(options.form.setValue).toHaveBeenCalledWith(
        'references',
        ['asset-1', 'asset-2', 'asset-3'],
        { shouldValidate: true },
      );
    });

    it('enforces max reference count limit', () => {
      const options = {
        ...createBaseOptions(),
        maxReferenceCount: 2,
        supportsMultipleReferences: true,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const assets = [
        createMockAsset({ id: 'asset-1' }),
        createMockAsset({ id: 'asset-2' }),
        createMockAsset({ id: 'asset-3' }),
      ];

      act(() => {
        result.current.handleReferenceSelect(assets);
      });

      expect(result.current.references).toHaveLength(2);
      expect(options.notificationsService.error).toHaveBeenCalledWith(
        'You can only select up to 2 references.',
      );
    });

    it('removes duplicate references by ID', () => {
      const options = {
        ...createBaseOptions(),
        maxReferenceCount: 5,
        supportsMultipleReferences: true,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const assets = [
        createMockAsset({ id: 'asset-1' }),
        createMockAsset({ id: 'asset-1' }), // Duplicate
        createMockAsset({ id: 'asset-2' }),
      ];

      act(() => {
        result.current.handleReferenceSelect(assets);
      });

      expect(result.current.references).toHaveLength(2);
    });

    it('clears references when empty array passed', () => {
      const options = {
        ...createBaseOptions(),
        maxReferenceCount: 5,
        supportsMultipleReferences: true,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const assets = [createMockAsset()];

      act(() => {
        result.current.handleReferenceSelect(assets);
      });

      act(() => {
        result.current.handleReferenceSelect([]);
      });

      expect(result.current.references).toHaveLength(0);
      expect(result.current.referenceSource).toBe('');
    });
  });

  describe('Aspect Ratio Validation', () => {
    it('warns about portrait image for landscape video', () => {
      const options = {
        ...createBaseOptions(),
        currentFormat: IngredientFormat.LANDSCAPE,
        currentModelCategory: ModelCategory.VIDEO,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const portraitImage = createMockAsset({
        metadataHeight: 1920, // Portrait aspect ratio
        metadataWidth: 1080,
      });

      act(() => {
        result.current.handleReferenceSelect(portraitImage);
      });

      expect(options.notificationsService.warning).toHaveBeenCalledWith(
        expect.stringContaining('landscape video format'),
        5000,
      );
    });

    it('warns about landscape image for portrait video', () => {
      const options = {
        ...createBaseOptions(),
        currentFormat: IngredientFormat.PORTRAIT,
        currentModelCategory: ModelCategory.VIDEO,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const landscapeImage = createMockAsset({
        metadataHeight: 1080, // Landscape aspect ratio
        metadataWidth: 1920,
      });

      act(() => {
        result.current.handleReferenceSelect(landscapeImage);
      });

      expect(options.notificationsService.warning).toHaveBeenCalledWith(
        expect.stringContaining('portrait video format'),
        5000,
      );
    });

    it('warns about non-square image for square video', () => {
      const options = {
        ...createBaseOptions(),
        currentFormat: IngredientFormat.SQUARE,
        currentModelCategory: ModelCategory.VIDEO,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const nonSquareImage = createMockAsset({
        metadataHeight: 1080,
        metadataWidth: 1920,
      });

      act(() => {
        result.current.handleReferenceSelect(nonSquareImage);
      });

      expect(options.notificationsService.warning).toHaveBeenCalledWith(
        expect.stringContaining('square video format'),
        5000,
      );
    });

    it('does not warn when aspect ratios match', () => {
      const options = {
        ...createBaseOptions(),
        currentFormat: IngredientFormat.LANDSCAPE,
        currentModelCategory: ModelCategory.VIDEO,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const landscapeImage = createMockAsset({
        metadataHeight: 1080,
        metadataWidth: 1920,
      });

      act(() => {
        result.current.handleReferenceSelect(landscapeImage);
      });

      expect(options.notificationsService.warning).not.toHaveBeenCalled();
    });

    it('does not validate aspect ratio for image category', () => {
      const options = {
        ...createBaseOptions(),
        currentFormat: IngredientFormat.LANDSCAPE,
        currentModelCategory: ModelCategory.IMAGE,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const portraitImage = createMockAsset({
        metadataHeight: 1920,
        metadataWidth: 1080,
      });

      act(() => {
        result.current.handleReferenceSelect(portraitImage);
      });

      expect(options.notificationsService.warning).not.toHaveBeenCalled();
    });

    it('handles images without dimensions', () => {
      const options = {
        ...createBaseOptions(),
        currentFormat: IngredientFormat.LANDSCAPE,
        currentModelCategory: ModelCategory.VIDEO,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const imageWithoutDimensions = {
        id: 'asset-1',
        ingredientUrl: 'https://example.com/image.jpg',
      };

      act(() => {
        result.current.handleReferenceSelect(imageWithoutDimensions as any);
      });

      expect(options.notificationsService.warning).not.toHaveBeenCalled();
    });

    it('counts multiple incompatible images in warning', () => {
      const options = {
        ...createBaseOptions(),
        currentFormat: IngredientFormat.LANDSCAPE,
        currentModelCategory: ModelCategory.VIDEO,
        maxReferenceCount: 5,
        supportsMultipleReferences: true,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const portraits = [
        createMockAsset({
          id: 'asset-1',
          metadataHeight: 1920,
          metadataWidth: 1080,
        }),
        createMockAsset({
          id: 'asset-2',
          metadataHeight: 1920,
          metadataWidth: 1080,
        }),
      ];

      act(() => {
        result.current.handleReferenceSelect(portraits);
      });

      expect(options.notificationsService.warning).toHaveBeenCalledWith(
        expect.stringContaining('2 reference images have'),
        5000,
      );
    });
  });

  describe('Account/Brand Reference Selection', () => {
    it('handles single account reference', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarReferences(options));

      const accountAssets = [
        { id: 'brand-asset-1', url: 'https://example.com/brand.jpg' },
      ];

      act(() => {
        result.current.handleSelectAccountReference(accountAssets);
      });

      expect(result.current.references).toHaveLength(1);
      expect(result.current.referenceSource).toBe('brand');
      expect(options.form.setValue).toHaveBeenCalledWith(
        'references',
        ['brand-asset-1'],
        { shouldValidate: true },
      );
    });

    it('handles multiple account references', () => {
      const options = {
        ...createBaseOptions(),
        maxReferenceCount: 5,
        supportsMultipleReferences: true,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const accountAssets = [
        { id: 'brand-asset-1', url: 'https://example.com/brand1.jpg' },
        { id: 'brand-asset-2', url: 'https://example.com/brand2.jpg' },
      ];

      act(() => {
        result.current.handleSelectAccountReference(accountAssets);
      });

      expect(result.current.references).toHaveLength(2);
      expect(result.current.referenceSource).toBe('brand');
    });

    it('enforces max reference count for account references', () => {
      const options = {
        ...createBaseOptions(),
        maxReferenceCount: 2,
        supportsMultipleReferences: true,
      };
      const { result } = renderHook(() => usePromptBarReferences(options));

      const accountAssets = [
        { id: 'brand-asset-1', url: 'https://example.com/1.jpg' },
        { id: 'brand-asset-2', url: 'https://example.com/2.jpg' },
        { id: 'brand-asset-3', url: 'https://example.com/3.jpg' },
      ];

      act(() => {
        result.current.handleSelectAccountReference(accountAssets);
      });

      expect(result.current.references).toHaveLength(2);
      expect(options.notificationsService.error).toHaveBeenCalledWith(
        'You can only select up to 2 references.',
      );
    });

    it('clears references when empty array passed', () => {
      const options = createBaseOptions();
      const { result } = renderHook(() => usePromptBarReferences(options));

      const accountAssets = [
        { id: 'brand-asset-1', url: 'https://example.com/brand.jpg' },
      ];

      act(() => {
        result.current.handleSelectAccountReference(accountAssets);
      });

      act(() => {
        result.current.handleSelectAccountReference([]);
      });

      expect(result.current.references).toHaveLength(0);
      expect(result.current.referenceSource).toBe('');
    });
  });

  describe('End Frame Management', () => {
    it('can set end frame', () => {
      const { result } = renderHook(() =>
        usePromptBarReferences(createBaseOptions()),
      );

      const endFrameAsset = createMockAsset({ id: 'end-frame-1' });

      act(() => {
        result.current.setEndFrame(endFrameAsset);
      });

      expect(result.current.endFrame).toEqual(endFrameAsset);
    });

    it('can clear end frame', () => {
      const { result } = renderHook(() =>
        usePromptBarReferences(createBaseOptions()),
      );

      const endFrameAsset = createMockAsset({ id: 'end-frame-1' });

      act(() => {
        result.current.setEndFrame(endFrameAsset);
      });

      act(() => {
        result.current.setEndFrame(null);
      });

      expect(result.current.endFrame).toBeNull();
    });
  });

  describe('State Setters', () => {
    it('provides setReferences function', () => {
      const { result } = renderHook(() =>
        usePromptBarReferences(createBaseOptions()),
      );

      const assets = [createMockAsset()];

      act(() => {
        result.current.setReferences(assets);
      });

      expect(result.current.references).toEqual(assets);
    });

    it('provides setReferenceSource function', () => {
      const { result } = renderHook(() =>
        usePromptBarReferences(createBaseOptions()),
      );

      act(() => {
        result.current.setReferenceSource('brand');
      });

      expect(result.current.referenceSource).toBe('brand');
    });
  });

  describe('All Return Values', () => {
    it('returns all expected properties', () => {
      const { result } = renderHook(() =>
        usePromptBarReferences(createBaseOptions()),
      );

      expect(result.current).toHaveProperty('references');
      expect(result.current).toHaveProperty('setReferences');
      expect(result.current).toHaveProperty('endFrame');
      expect(result.current).toHaveProperty('setEndFrame');
      expect(result.current).toHaveProperty('referenceSource');
      expect(result.current).toHaveProperty('setReferenceSource');
      expect(result.current).toHaveProperty('handleReferenceSelect');
      expect(result.current).toHaveProperty('handleSelectAccountReference');
      expect(result.current).toHaveProperty('isUserSelectingReferencesRef');
      expect(result.current).toHaveProperty('hasInitializedReferencesRef');
    });
  });
});
