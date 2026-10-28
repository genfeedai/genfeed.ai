// @vitest-environment jsdom

import { ModelCategory } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudActionNodeInspector } from './CloudActionNodeInspector';

const mocks = vi.hoisted(() => ({
  actionId: 'imageGen',
  parameters: {} as Record<string, unknown>,
  updateNodeData: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [{ id: 'brand-1', label: 'Shipshit' }],
    credentials: [],
    organizationId: 'org-1',
    selectedBrand: { agentConfig: {}, label: 'Shipshit' },
  }),
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: () => ({ strategies: [] }),
}));

vi.mock('@/features/workflows/hooks/useWorkflowModelCatalog', () => ({
  useWorkflowModelCatalog: () => ({
    hasError: false,
    isLoading: false,
    models: [
      {
        category: ModelCategory.IMAGE,
        key: 'black-forest-labs/flux-2-pro',
        label: 'Flux 2 Pro',
      },
    ] as IModel[],
  }),
}));

vi.mock('@/features/workflows/hooks/useWorkflowRecentPrompts', () => ({
  useWorkflowRecentPrompts: (isEnabled: boolean) => ({
    hasError: false,
    isLoading: false,
    prompts: isEnabled ? [{ id: 'p-1', text: 'A neon alley at night' }] : [],
  }),
}));

vi.mock('@genfeedai/workflows/ui/stores', () => ({
  useSettingsStore: (selector: (state: object) => unknown) =>
    selector({ addRecentModel: vi.fn(), recentModels: [] }),
  useUIStore: (selector: (state: object) => unknown) =>
    selector({ selectNode: vi.fn(), selectedNodeId: 'node-1' }),
  useWorkflowStore: (selector: (state: object) => unknown) =>
    selector({
      nodes: [
        {
          data: { actionId: mocks.actionId, parameters: mocks.parameters },
          id: 'node-1',
          type: 'genfeedAction',
        },
      ],
      updateNodeData: mocks.updateNodeData,
    }),
}));

describe('CloudActionNodeInspector pickers', () => {
  beforeEach(() => {
    mocks.actionId = 'imageGen';
    mocks.parameters = {};
    mocks.updateNodeData.mockClear();
  });

  it('replaces the model text field with a catalog picker for image generation', () => {
    mocks.parameters = { model: 'black-forest-labs/flux-2-pro' };
    render(<CloudActionNodeInspector />);

    expect(screen.queryByRole('textbox', { name: 'Model' })).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Model Flux 2 Pro' });
    expect(trigger).toBeTruthy();

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Choose a model' });
    expect(within(dialog).getByText('All models')).toBeTruthy();
  });

  it('writes the chosen catalog key into the node parameters', () => {
    render(<CloudActionNodeInspector />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Model Choose a model' }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Flux 2 Pro/ }));

    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
      model: 'black-forest-labs/flux-2-pro',
      parameters: { model: 'black-forest-labs/flux-2-pro' },
    });
  });

  it('writes a recent prompt into the prompt field', () => {
    render(<CloudActionNodeInspector />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Use a recent prompt' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'A neon alley at night' }),
    );

    expect(mocks.updateNodeData).toHaveBeenCalledWith('node-1', {
      parameters: { prompt: 'A neon alley at night' },
      prompt: 'A neon alley at night',
    });
  });

  it('keeps the plain model field for actions without a catalog category', () => {
    mocks.actionId = 'upscale';
    render(<CloudActionNodeInspector />);

    expect(
      screen.queryByRole('button', { name: 'Model Choose a model' }),
    ).toBeNull();
    expect(screen.getByLabelText('Model')).toBeTruthy();
  });
});
