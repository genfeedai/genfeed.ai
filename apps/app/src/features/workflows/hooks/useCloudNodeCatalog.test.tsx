// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const { useCloudNodeCatalog } = await import('./useCloudNodeCatalog');

describe('useCloudNodeCatalog', () => {
  it('projects canonical action categories and icons into the catalog', () => {
    const { result } = renderHook(() => useCloudNodeCatalog());
    const nodes = result.current;

    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.find((node) => node.type === 'input-image')).toMatchObject({
      category: 'input',
      icon: 'Image',
      label: 'Image',
    });
    expect(nodes.find((node) => node.type === 'input-video')).toMatchObject({
      category: 'input',
      icon: 'Video',
      label: 'Video',
    });
    expect(nodes.some((node) => node.label === 'Image Input')).toBe(false);
    expect(nodes.some((node) => node.label === 'Video Input')).toBe(false);
    expect(new Set(nodes.map((node) => node.category))).toEqual(
      new Set(['input', 'ai', 'processing', 'composition', 'output']),
    );
    expect(nodes.find((node) => node.actionId === 'imageGen')).toMatchObject({
      category: 'ai',
      icon: 'Image',
    });
    expect(nodes.find((node) => node.actionId === 'socialRead')).toMatchObject({
      category: 'input',
      icon: 'Search',
    });
    expect(nodes.find((node) => node.actionId === 'publish')).toMatchObject({
      category: 'output',
      icon: 'Navigation',
    });
  });
});
