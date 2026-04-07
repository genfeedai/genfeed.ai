import * as LazyModals from '@ui/lazy/modal/LazyModal';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock next/dynamic
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (
    _fn: () => Promise<unknown>,
    _options?: Record<string, unknown>,
  ) => {
    const Component = () => (
      <div data-testid="lazy-component">Lazy Loaded Component</div>
    );

    Component.displayName = 'LazyComponent';
    return Component;
  },
}));

describe('LazyModal', () => {
  describe('Account Modals', () => {
    it('should export LazyBrandOverlay', () => {
      expect(LazyModals.LazyBrandOverlay).toBeDefined();
      expect(typeof LazyModals.LazyBrandOverlay).toBe('function');
    });

    it('should export LazyModalBrandGenerate', () => {
      expect(LazyModals.LazyModalBrandGenerate).toBeDefined();
      expect(typeof LazyModals.LazyModalBrandGenerate).toBe('function');
    });

    it('should export LazyModalBrandInstagram', () => {
      expect(LazyModals.LazyModalBrandInstagram).toBeDefined();
      expect(typeof LazyModals.LazyModalBrandInstagram).toBe('function');
    });

    it('should export LazyModalBrandLink', () => {
      expect(LazyModals.LazyModalBrandLink).toBeDefined();
      expect(typeof LazyModals.LazyModalBrandLink).toBe('function');
    });
  });

  describe('Ingredient Modals', () => {
    it('should export LazyModalAvatar', () => {
      expect(LazyModals.LazyModalAvatar).toBeDefined();
      expect(typeof LazyModals.LazyModalAvatar).toBe('function');
    });

    it('should export LazyIngredientOverlay', () => {
      expect(LazyModals.LazyIngredientOverlay).toBeDefined();
      expect(typeof LazyModals.LazyIngredientOverlay).toBe('function');
    });

    it('should export LazyModalMusic', () => {
      expect(LazyModals.LazyModalMusic).toBeDefined();
      expect(typeof LazyModals.LazyModalMusic).toBe('function');
    });

    it('should export LazyModalVideo', () => {
      expect(LazyModals.LazyModalVideo).toBeDefined();
      expect(typeof LazyModals.LazyModalVideo).toBe('function');
    });

    it('should render LazyIngredientOverlay when mounted', async () => {
      const { getByTestId } = render(
        <LazyModals.LazyIngredientOverlay
          ingredient={null}
          onConfirm={() => {}}
        />,
      );
      await waitFor(() => {
        expect(getByTestId('lazy-component')).toBeInTheDocument();
      });
    });
  });

  describe('Element Modals', () => {
    it('should export LazyModalBlacklist', () => {
      expect(LazyModals.LazyModalBlacklist).toBeDefined();
      expect(typeof LazyModals.LazyModalBlacklist).toBe('function');
    });

    it('should export LazyModalCamera', () => {
      expect(LazyModals.LazyModalCamera).toBeDefined();
      expect(typeof LazyModals.LazyModalCamera).toBe('function');
    });

    it('should export LazyModalFontFamily', () => {
      expect(LazyModals.LazyModalFontFamily).toBeDefined();
      expect(typeof LazyModals.LazyModalFontFamily).toBe('function');
    });

    it('should export LazyModalMood', () => {
      expect(LazyModals.LazyModalMood).toBeDefined();
      expect(typeof LazyModals.LazyModalMood).toBe('function');
    });

    it('should export LazyModalPreset', () => {
      expect(LazyModals.LazyModalPreset).toBeDefined();
      expect(typeof LazyModals.LazyModalPreset).toBe('function');
    });

    it('should export LazyModalScene', () => {
      expect(LazyModals.LazyModalScene).toBeDefined();
      expect(typeof LazyModals.LazyModalScene).toBe('function');
    });

    it('should export LazyModalSound', () => {
      expect(LazyModals.LazyModalSound).toBeDefined();
      expect(typeof LazyModals.LazyModalSound).toBe('function');
    });

    it('should export LazyModalStyle', () => {
      expect(LazyModals.LazyModalStyle).toBeDefined();
      expect(typeof LazyModals.LazyModalStyle).toBe('function');
    });

    it('should export LazyModalTag', () => {
      expect(LazyModals.LazyModalTag).toBeDefined();
      expect(typeof LazyModals.LazyModalTag).toBe('function');
    });
  });

  describe('Other Modals', () => {
    it('should export LazyModalConfirm', () => {
      expect(LazyModals.LazyModalConfirm).toBeDefined();
      expect(typeof LazyModals.LazyModalConfirm).toBe('function');
    });

    it('should export LazyModalCredential', () => {
      expect(LazyModals.LazyModalCredential).toBeDefined();
      expect(typeof LazyModals.LazyModalCredential).toBe('function');
    });

    it('should export LazyModalExport', () => {
      expect(LazyModals.LazyModalExport).toBeDefined();
      expect(typeof LazyModals.LazyModalExport).toBe('function');
    });

    it('should export LazyModalFolder', () => {
      expect(LazyModals.LazyModalFolder).toBeDefined();
      expect(typeof LazyModals.LazyModalFolder).toBe('function');
    });

    it('should export LazyModalGallery', () => {
      expect(LazyModals.LazyModalGallery).toBeDefined();
      expect(typeof LazyModals.LazyModalGallery).toBe('function');
    });

    it('should export LazyModalMetadata', () => {
      expect(LazyModals.LazyModalMetadata).toBeDefined();
      expect(typeof LazyModals.LazyModalMetadata).toBe('function');
    });

    it('should export LazyModalPrompt', () => {
      expect(LazyModals.LazyModalPrompt).toBeDefined();
      expect(typeof LazyModals.LazyModalPrompt).toBe('function');
    });

    it('should export LazyModalPost', () => {
      expect(LazyModals.LazyModalPost).toBeDefined();
      expect(typeof LazyModals.LazyModalPost).toBe('function');
    });

    it('should export LazyModalTextOverlay', () => {
      expect(LazyModals.LazyModalTextOverlay).toBeDefined();
      expect(typeof LazyModals.LazyModalTextOverlay).toBe('function');
    });

    it('should export LazyModalUpload', () => {
      expect(LazyModals.LazyModalUpload).toBeDefined();
      expect(typeof LazyModals.LazyModalUpload).toBe('function');
    });
  });

  it('should have all exported modals as functions', () => {
    const exports = Object.values(LazyModals);
    exports.forEach((exportedItem) => {
      expect(typeof exportedItem).toBe('function');
    });
  });

  it('should have correct number of exported modals', () => {
    const exports = Object.keys(LazyModals);
    expect(exports.length).toBe(47); // Count of all exported modals
  });
});
