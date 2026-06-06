import type { JSONContent } from '@tiptap/core';

interface WorkspaceBrandMentionMatch {
  id: string;
  label: string;
}

export function getBrandDisplayLabel(brand?: {
  label?: string;
  name?: string | null;
}): string {
  return brand?.label || brand?.name || 'Selected brand';
}

export function extractBrandMentionMatch(
  node: JSONContent | null | undefined,
): WorkspaceBrandMentionMatch | null {
  if (!node) {
    return null;
  }

  if (node.type === 'mention' && node.attrs?.id) {
    return {
      id: String(node.attrs.id),
      label: String(node.attrs.label ?? node.attrs.id ?? '').trim() || 'Brand',
    };
  }

  for (const child of node.content ?? []) {
    const match = extractBrandMentionMatch(child);
    if (match) {
      return match;
    }
  }

  return null;
}
