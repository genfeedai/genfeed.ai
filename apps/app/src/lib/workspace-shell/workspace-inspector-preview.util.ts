import type { IAsset, IIngredient } from '@genfeedai/contracts/interfaces';

import type { LibraryArtifactReference } from '@/features/library-remix/library-remix-reference';

export type WorkspaceInspectorPreview = {
  readonly record: IAsset | IIngredient;
  readonly reference?: LibraryArtifactReference;
};

export type WorkspaceInspectorBrowserPreview =
  | {
      readonly kind: 'library';
      readonly record: IAsset | IIngredient;
      readonly reference?: LibraryArtifactReference;
    }
  | {
      readonly kind: 'url';
      readonly label: string;
      readonly url: string;
    }
  | {
      readonly kind: 'empty';
    };

export function isInspectorPreviewHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveInspectorBrowserPreview(input: {
  readonly pageUrl?: string | null;
  readonly selected: WorkspaceInspectorPreview | null;
}): WorkspaceInspectorBrowserPreview {
  if (input.selected) {
    return {
      kind: 'library',
      record: input.selected.record,
      reference: input.selected.reference,
    };
  }

  if (input.pageUrl && isInspectorPreviewHttpUrl(input.pageUrl)) {
    return {
      kind: 'url',
      label: new URL(input.pageUrl).hostname,
      url: input.pageUrl,
    };
  }

  return { kind: 'empty' };
}
