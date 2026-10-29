import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  decodeWorkflowNodeTransfer,
  WORKFLOW_NODE_TRANSFER_TYPE,
} from '../lib/paletteTransfer';
import { NodeCatalog } from './NodeCatalog';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      empty: 'No nodes found',
      searchLabel: 'Search nodes',
      searchPlaceholder: 'Search nodes...',
    })[key] ?? key,
}));

vi.mock('@genfeedai/contracts/types', () => ({
  getNodesByCategory: () => ({
    ai: [],
    composition: [],
    input: [],
    output: [],
    processing: [],
  }),
}));

describe('NodeCatalog', () => {
  it('keeps the action binding when an action is dragged from search results', () => {
    render(
      <NodeCatalog
        additionalNodes={[
          {
            actionId: 'media.image.generate',
            category: 'ai',
            description: 'Creates one image.',
            icon: 'Sparkles',
            label: 'Generate Image',
            type: 'genfeedAction',
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search nodes' }), {
      target: { value: 'Generate Image' },
    });

    const card = screen.getByRole('button', { name: /Generate Image/ });
    expect(card.className).toContain('normal-case');

    const setData = vi.fn();
    fireEvent.dragStart(
      screen.getByRole('button', { name: /Generate Image/ }),
      {
        dataTransfer: { effectAllowed: 'none', setData },
      },
    );

    expect(setData).toHaveBeenCalledOnce();
    const [type, encoded] = setData.mock.calls[0] as [string, string];
    expect(type).toBe(WORKFLOW_NODE_TRANSFER_TYPE);
    expect(decodeWorkflowNodeTransfer(encoded)).toEqual({
      actionId: 'media.image.generate',
      label: 'Generate Image',
      type: 'genfeedAction',
      version: 1,
    });
  });

  it('lists nodes alphabetically by label inside a category', () => {
    render(
      <NodeCatalog
        additionalNodes={[
          {
            category: 'input',
            description: 'Video from the library',
            icon: 'Video',
            label: 'Video',
            type: 'input-video',
          },
          {
            category: 'input',
            description: 'Brand colors',
            icon: 'Layers',
            label: 'Brand',
            type: 'genfeedAction',
          },
          {
            category: 'input',
            description: 'Image from the library',
            icon: 'Image',
            label: 'Image',
            type: 'input-image',
          },
        ]}
      />,
    );

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent ?? '')
      .filter(
        (text) =>
          text.startsWith('Brand') ||
          text.startsWith('Image') ||
          text.startsWith('Video'),
      );

    expect(labels[0]).toContain('Brand');
    expect(labels[1]).toContain('Image');
    expect(labels[2]).toContain('Video');
  });

  it('reports the clicked entry with its action binding', () => {
    const onAdd = vi.fn();
    render(
      <NodeCatalog
        additionalNodes={[
          {
            actionId: 'media.image.generate',
            category: 'ai',
            description: 'Creates one image.',
            icon: 'Sparkles',
            label: 'Generate Image',
            type: 'genfeedAction',
          },
        ]}
        onAdd={onAdd}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search nodes' }), {
      target: { value: 'Generate Image' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Generate Image/ }));

    expect(onAdd).toHaveBeenCalledWith({
      actionId: 'media.image.generate',
      label: 'Generate Image',
      type: 'genfeedAction',
    });
  });
});
