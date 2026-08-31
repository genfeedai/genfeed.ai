// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { nodePaletteSpy } = vi.hoisted(() => ({
  nodePaletteSpy: vi.fn(),
}));

vi.mock('@genfeedai/workflows/ui', () => ({
  NodePalette: (props: unknown) => {
    nodePaletteSpy(props);
    return null;
  },
}));

const { CloudNodePalette } = await import('./CloudNodePalette');

describe('CloudNodePalette', () => {
  it('projects canonical action categories and icons into the palette', () => {
    render(<CloudNodePalette />);

    const props = nodePaletteSpy.mock.lastCall?.[0] as {
      additionalNodes: Array<{
        actionId: string;
        category: string;
        icon: string;
      }>;
      baseNodeTypes: readonly string[];
    };

    expect(props.baseNodeTypes).toEqual(['workflowInput']);
    expect(props.additionalNodes.length).toBeGreaterThan(0);
    expect(new Set(props.additionalNodes.map((node) => node.category))).toEqual(
      new Set(['input', 'ai', 'processing', 'composition', 'output']),
    );
    expect(
      props.additionalNodes.find((node) => node.actionId === 'imageGen'),
    ).toMatchObject({ category: 'ai', icon: 'Image' });
    expect(
      props.additionalNodes.find((node) => node.actionId === 'socialRead'),
    ).toMatchObject({ category: 'input', icon: 'Search' });
    expect(
      props.additionalNodes.find((node) => node.actionId === 'publish'),
    ).toMatchObject({ category: 'output', icon: 'Navigation' });
  });
});
