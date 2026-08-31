import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionNodeInspector } from './ActionNodeInspector';

const mocks = vi.hoisted(() => ({
  selectNode: vi.fn(),
  updateNodeData: vi.fn(),
}));

vi.mock('@genfeedai/actions', () => ({
  getActionDefinition: (actionId: string) =>
    actionId === 'media.image.generate'
      ? {
          description: 'Creates one image.',
          id: actionId,
          inputSchema: {
            properties: {
              count: { type: 'integer' },
              prompt: { type: 'string' },
            },
            required: ['prompt'],
            type: 'object',
          },
          label: 'Generate Image',
        }
      : undefined,
}));

vi.mock('../stores/uiStore', () => ({
  useUIStore: (selector: (state: object) => unknown) =>
    selector({ selectedNodeId: 'node-1', selectNode: mocks.selectNode }),
}));

vi.mock('../stores/workflow', () => ({
  useWorkflowStore: (selector: (state: object) => unknown) =>
    selector({
      nodes: [
        {
          data: {
            actionId: 'media.image.generate',
            parameters: { count: 2, prompt: 'Existing prompt' },
          },
          id: 'node-1',
          type: 'genfeedAction',
        },
      ],
      updateNodeData: mocks.updateNodeData,
    }),
}));

describe('ActionNodeInspector', () => {
  beforeEach(() => {
    mocks.selectNode.mockClear();
    mocks.updateNodeData.mockClear();
  });

  it('renders persisted action values and writes schema-backed edits', () => {
    render(<ActionNodeInspector />);

    expect(
      screen.getByRole('complementary', { name: /Generate Image/ }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Prompt/)).toHaveValue('Existing prompt');
    expect(screen.getByLabelText('Count')).toHaveValue(2);

    fireEvent.change(screen.getByLabelText(/Prompt/), {
      target: { value: 'Updated prompt' },
    });

    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
      prompt: 'Updated prompt',
      parameters: { count: 2, prompt: 'Updated prompt' },
    });
  });
});
