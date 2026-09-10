// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudActionNodeInspector } from './CloudActionNodeInspector';

const mocks = vi.hoisted(() => ({
  selectNode: vi.fn(),
  updateNodeData: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@genfeedai/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/actions')>();
  return {
    ...actual,
    getActionDefinition: (actionId: string) =>
      actionId === 'daily-publishing.resolve'
        ? {
            description: 'Brand settings and connected accounts.',
            id: actionId,
            inputSchema: {
              properties: {
                autoPublish: { type: 'boolean' },
                brandId: { type: 'string' },
                credentialIds: { items: { type: 'string' }, type: 'array' },
                timezone: { type: 'string' },
              },
              required: ['brandId'],
              type: 'object',
            },
            label: 'Accounts',
          }
        : actual.getActionDefinition(actionId),
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-shipshit',
    brands: [
      { id: 'brand-shipshit', label: 'Shipshit' },
      { id: 'brand-acme', label: 'Acme' },
    ],
    credentials: [
      {
        externalHandle: 'VincentShipsIt',
        id: 'cred-x',
        isConnected: true,
        platform: 'twitter',
      },
    ],
    selectedBrand: {
      agentConfig: { schedule: { timezone: 'UTC' } },
      label: 'Shipshit',
    },
  }),
}));

vi.mock('@hooks/data/agent-strategies/use-agent-strategies', () => ({
  useAgentStrategies: () => ({ strategies: [] }),
}));

vi.mock('@genfeedai/workflows/ui/stores', () => ({
  useUIStore: (selector: (state: object) => unknown) =>
    selector({ selectNode: mocks.selectNode, selectedNodeId: 'node-1' }),
  useWorkflowStore: (selector: (state: object) => unknown) =>
    selector({
      nodes: [
        {
          data: {
            actionId: 'daily-publishing.resolve',
            parameters: {},
          },
          id: 'node-1',
          type: 'genfeedAction',
        },
      ],
      updateNodeData: mocks.updateNodeData,
    }),
}));

describe('CloudActionNodeInspector', () => {
  beforeEach(() => {
    mocks.selectNode.mockClear();
    mocks.updateNodeData.mockClear();
  });

  it('shows a brand dropdown and account picker instead of id text fields', () => {
    render(<CloudActionNodeInspector />);

    expect(screen.getByRole('combobox', { name: 'Brand' })).toBeTruthy();
    expect(screen.getByText('Shipshit')).toBeTruthy();
    expect(
      screen.queryByPlaceholderText('Separate values with commas'),
    ).toBeNull();
    expect(screen.queryByLabelText(/Brand Id/i)).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Timezone' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Select connected accounts/i }),
    ).toBeTruthy();
  });
});
