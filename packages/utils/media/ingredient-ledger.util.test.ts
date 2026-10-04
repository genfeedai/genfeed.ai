import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient, IMetadata } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  formatIngredientFileSize,
  getIngredientDimensionsLabel,
  getIngredientDurationLabel,
  getIngredientFailureReason,
  getIngredientFormatLabel,
  getIngredientModelLabel,
  getIngredientPromptText,
  getIngredientSizeLabel,
  isFailedIngredient,
} from './ingredient-ledger.util';

function buildIngredient(overrides: Partial<IIngredient> = {}): IIngredient {
  return {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    status: IngredientStatus.GENERATED,
    ...overrides,
  } as IIngredient;
}

function buildMetadata(overrides: Partial<IMetadata> = {}): IMetadata {
  return {
    createdAt: '2026-10-04T00:00:00.000Z',
    id: 'metadata-1',
    isDeleted: false,
    label: 'asset',
    updatedAt: '2026-10-04T00:00:00.000Z',
    ...overrides,
  };
}

describe('getIngredientModelLabel', () => {
  it('prefers the generation ledger over a refreshable display label', () => {
    const ingredient = buildIngredient({
      metadataModelLabel: 'FLUX 1.1 Pro',
      model: 'flux-schnell',
      modelUsed: 'black-forest-labs/flux-schnell',
    });

    expect(getIngredientModelLabel(ingredient)).toBe(
      'black-forest-labs/flux-schnell',
    );
  });

  it('falls back through the label chain when the ledger is empty', () => {
    expect(
      getIngredientModelLabel(
        buildIngredient({ metadataModelLabel: 'FLUX 1.1 Pro' }),
      ),
    ).toBe('FLUX 1.1 Pro');

    expect(
      getIngredientModelLabel(buildIngredient({ model: 'flux-schnell' })),
    ).toBe('flux-schnell');
  });

  it('treats blank strings as absent', () => {
    expect(
      getIngredientModelLabel(
        buildIngredient({ model: 'flux-schnell', modelUsed: '   ' }),
      ),
    ).toBe('flux-schnell');
  });

  it('returns null when nothing recorded a model', () => {
    expect(getIngredientModelLabel(buildIngredient())).toBeNull();
  });
});

describe('formatIngredientFileSize', () => {
  it('scales through byte units', () => {
    expect(formatIngredientFileSize(512)).toBe('512 B');
    expect(formatIngredientFileSize(2048)).toBe('2 KB');
    expect(formatIngredientFileSize(1024 * 1024 * 3.5)).toBe('3.5 MB');
  });

  it('rejects non-positive and non-finite sizes', () => {
    expect(formatIngredientFileSize(0)).toBeNull();
    expect(formatIngredientFileSize(-1)).toBeNull();
    expect(formatIngredientFileSize(Number.NaN)).toBeNull();
    expect(formatIngredientFileSize(undefined)).toBeNull();
  });
});

describe('getIngredientSizeLabel', () => {
  it('measures a time-based asset in duration', () => {
    expect(
      getIngredientSizeLabel(
        buildIngredient({
          category: IngredientCategory.VIDEO,
          metadataDuration: 95,
          metadataHeight: 1920,
          metadataWidth: 1080,
        }),
      ),
    ).toBe('1:35');
  });

  it('measures a still in pixels', () => {
    expect(
      getIngredientSizeLabel(
        buildIngredient({ metadataHeight: 1920, metadataWidth: 1080 }),
      ),
    ).toBe('1080 × 1920');
  });

  it('falls back to the asset dimensions when metadata is missing', () => {
    expect(
      getIngredientSizeLabel(buildIngredient({ height: 512, width: 512 })),
    ).toBe('512 × 512');
  });

  it('falls back to weight when nothing else is known', () => {
    expect(
      getIngredientSizeLabel(buildIngredient({ fileSize: 1024 * 1024 })),
    ).toBe('1 MB');
  });

  it('returns null for an asset with no measurable size', () => {
    expect(getIngredientSizeLabel(buildIngredient())).toBeNull();
  });
});

describe('getIngredientFailureReason', () => {
  it('reports the provider reason on a failed asset', () => {
    expect(
      getIngredientFailureReason(
        buildIngredient({
          generationError: 'NSFW content detected',
          status: IngredientStatus.FAILED,
        }),
      ),
    ).toBe('NSFW content detected');
  });

  it('withholds a stale ledger error from an asset that since succeeded', () => {
    expect(
      getIngredientFailureReason(
        buildIngredient({
          generationError: 'Timed out',
          status: IngredientStatus.GENERATED,
        }),
      ),
    ).toBeNull();
  });

  it('returns null when a failure recorded no reason', () => {
    expect(
      getIngredientFailureReason(
        buildIngredient({ status: IngredientStatus.FAILED }),
      ),
    ).toBeNull();
  });
});

describe('isFailedIngredient', () => {
  it('identifies failures by status', () => {
    expect(
      isFailedIngredient(buildIngredient({ status: IngredientStatus.FAILED })),
    ).toBe(true);
    expect(
      isFailedIngredient(
        buildIngredient({ status: IngredientStatus.PROCESSING }),
      ),
    ).toBe(false);
  });
});

describe('inspector detail labels', () => {
  it('reads dimensions from stored metadata and never invents them', () => {
    expect(
      getIngredientDimensionsLabel(
        buildIngredient({
          metadata: buildMetadata({ height: 768, width: 1024 }),
          // The client model's placeholder getters must not leak through.
          metadataHeight: 1920,
          metadataWidth: 1080,
        }),
      ),
    ).toBe('1024 × 768');

    expect(
      getIngredientDimensionsLabel(
        buildIngredient({
          metadata: buildMetadata({ height: 0, width: 0 }),
          metadataHeight: 1920,
          metadataWidth: 1080,
        }),
      ),
    ).toBeNull();
  });

  it('shows a duration only for time-based assets', () => {
    expect(
      getIngredientDurationLabel(
        buildIngredient({ metadata: buildMetadata({ duration: 75 }) }),
      ),
    ).toBe('1:15');
    expect(
      getIngredientDurationLabel(
        buildIngredient({ metadata: buildMetadata({ duration: 0 }) }),
      ),
    ).toBeNull();
  });

  it('labels the format from the extension, then the MIME type', () => {
    expect(
      getIngredientFormatLabel(
        buildIngredient({ metadata: buildMetadata({ extension: 'png' }) }),
      ),
    ).toBe('PNG');
    expect(
      getIngredientFormatLabel(buildIngredient({ mimeType: 'video/mp4' })),
    ).toBe('video/mp4');
    expect(getIngredientFormatLabel(buildIngredient())).toBeNull();
  });

  it('falls back to the ledger prompt and keeps its whitespace', () => {
    expect(
      getIngredientPromptText(
        buildIngredient({ generationPrompt: '  a red mug\non a desk' }),
      ),
    ).toBe('  a red mug\non a desk');
    expect(
      getIngredientPromptText(
        buildIngredient({ generationPrompt: 'ledger', promptText: 'edited' }),
      ),
    ).toBe('edited');
    expect(getIngredientPromptText(buildIngredient({ promptText: ' ' }))).toBe(
      null,
    );
  });
});
