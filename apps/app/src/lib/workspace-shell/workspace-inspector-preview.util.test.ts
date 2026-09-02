import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import {
  isInspectorPreviewHttpUrl,
  resolveInspectorBrowserPreview,
} from './workspace-inspector-preview.util';

function ingredient(id: string): IIngredient {
  return {
    category: IngredientCategory.IMAGE,
    id,
    ingredientUrl: `https://cdn.example/${id}.jpg`,
  } as IIngredient;
}

describe('resolveInspectorBrowserPreview', () => {
  it('prefers a selected library record over a page URL', () => {
    const record = ingredient('image-1');

    expect(
      resolveInspectorBrowserPreview({
        pageUrl: 'https://x.com/genfeed/status/1',
        selected: {
          record,
          reference: {
            brandId: 'brand-1',
            kind: 'ingredient',
            organizationId: 'org-1',
            recordId: 'image-1',
            serializer: 'ingredient',
          },
        },
      }),
    ).toEqual({
      kind: 'library',
      record,
      reference: {
        brandId: 'brand-1',
        kind: 'ingredient',
        organizationId: 'org-1',
        recordId: 'image-1',
        serializer: 'ingredient',
      },
    });
  });

  it('accepts http(s) page URLs and rejects javascript URLs', () => {
    expect(isInspectorPreviewHttpUrl('https://app.genfeed.ai/library')).toBe(
      true,
    );
    expect(isInspectorPreviewHttpUrl('javascript:alert(1)')).toBe(false);
    expect(
      resolveInspectorBrowserPreview({
        pageUrl: 'javascript:alert(1)',
        selected: null,
      }),
    ).toEqual({ kind: 'empty' });
    expect(
      resolveInspectorBrowserPreview({
        pageUrl: 'https://x.com/genfeed/status/1',
        selected: null,
      }),
    ).toEqual({
      kind: 'url',
      label: 'x.com',
      url: 'https://x.com/genfeed/status/1',
    });
  });
});
