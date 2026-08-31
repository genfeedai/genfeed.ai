import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  decodeWorkflowNodeTransfer,
  WORKFLOW_NODE_TRANSFER_TYPE,
} from '../lib/paletteTransfer';
import { NodePalette } from './NodePalette';

vi.mock('@genfeedai/types', () => ({
  getNodesByCategory: () => ({
    ai: [],
    composition: [],
    input: [],
    output: [],
    processing: [],
  }),
}));

vi.mock('../stores/uiStore', () => ({
  useUIStore: () => ({ togglePalette: vi.fn() }),
}));

describe('NodePalette', () => {
  it('keeps the action binding when an action is dragged from search results', () => {
    render(
      <NodePalette
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
});
