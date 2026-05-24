import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebhookTriggerNode } from './WebhookTriggerNode';

const mocks = vi.hoisted(() => ({
  createWebhook: vi.fn(),
  getService: vi.fn(),
  regenerateWebhookSecret: vi.fn(),
  updateNodeData: vi.fn(),
  workflowId: 'workflow-1' as string | null,
  writeText: vi.fn(),
}));

vi.mock('@genfeedai/workflow-ui/stores', () => {
  const useWorkflowStore = vi.fn(
    (
      selector: (state: {
        updateNodeData: typeof mocks.updateNodeData;
      }) => unknown,
    ) => selector({ updateNodeData: mocks.updateNodeData }),
  );
  useWorkflowStore.getState = () => ({ workflowId: mocks.workflowId });

  return {
    selectUpdateNodeData: (state: {
      updateNodeData: typeof mocks.updateNodeData;
    }) => state.updateNodeData,
    useWorkflowStore,
  };
});

vi.mock('@/features/workflows/hooks/useNodeExecution', () => ({
  useNodeExecution: () => ({
    getService: mocks.getService,
  }),
}));

vi.mock('@genfeedai/ui', () => ({
  Code: ({ children }: { children?: ReactNode }) => <code>{children}</code>,
  Pre: ({ children }: { children?: ReactNode }) => <pre>{children}</pre>,
}));

vi.mock('@ui/primitives/collapsible', () => ({
  Collapsible: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CollapsibleContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CollapsibleTrigger: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: ({ value }: { value?: string | null }) => (
    <time>{value}</time>
  ),
}));

vi.mock('@/features/workflows/components/ui/badge', () => ({
  NodeBadge: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/features/workflows/components/ui/button', () => ({
  NodeButton: ({
    children,
    onClick,
  }: {
    children?: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  NodeIconButton: ({
    children,
    onClick,
    title,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    title?: string;
  }) => (
    <button aria-label={title} type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/features/workflows/components/ui/card', () => ({
  NodeCard: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  NodeDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  NodeHeader: ({ badge, title }: { badge?: ReactNode; title: string }) => (
    <header>
      <h2>{title}</h2>
      {badge}
    </header>
  ),
}));

vi.mock('@/features/workflows/components/ui/icons', () => ({
  CheckIcon: () => <span>check</span>,
  CopyIcon: () => <span>copy</span>,
  EyeIcon: () => <span>eye</span>,
  EyeOffIcon: () => <span>eye-off</span>,
  RefreshIcon: () => <span>refresh</span>,
  WebhookIcon: () => <span>webhook</span>,
}));

vi.mock('@/features/workflows/components/ui/inputs', () => ({
  NodeSelect: ({
    children,
    label,
    onChange,
    value,
  }: React.SelectHTMLAttributes<HTMLSelectElement> & {
    children?: ReactNode;
    label?: string;
  }) => (
    <label>
      {label}
      <select value={value} onChange={onChange}>
        {children}
      </select>
    </label>
  ),
}));

function renderWebhook(data: Record<string, unknown> = {}) {
  return render(
    <WebhookTriggerNode
      id="webhook-node"
      data={data}
      selected={false}
      type="webhookTrigger"
      zIndex={1}
      isConnectable
      dragging={false}
      deletable
      draggable
      selectable
      positionAbsoluteX={0}
      positionAbsoluteY={0}
    />,
  );
}

describe('WebhookTriggerNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workflowId = 'workflow-1';
    mocks.createWebhook.mockResolvedValue({
      authType: 'secret',
      lastTriggeredAt: '2026-05-20T08:00:00.000Z',
      triggerCount: 1,
      webhookId: 'webhook-1',
      webhookSecret: 'secret-1',
      webhookUrl: 'https://hooks.example.test/workflow',
    });
    mocks.regenerateWebhookSecret.mockResolvedValue({
      webhookSecret: 'secret-2',
    });
    mocks.getService.mockResolvedValue({
      createWebhook: mocks.createWebhook,
      regenerateWebhookSecret: mocks.regenerateWebhookSecret,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  it('generates webhook configuration and ignores generation without workflow context', async () => {
    renderWebhook({ authType: 'bearer' });

    expect(screen.getByText('Webhook Trigger')).toBeVisible();
    fireEvent.click(screen.getByText('Generate Webhook URL'));

    await waitFor(() => {
      expect(mocks.createWebhook).toHaveBeenCalledWith('workflow-1', 'bearer');
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'webhook-node',
      expect.objectContaining({
        webhookId: 'webhook-1',
        webhookSecret: 'secret-1',
        webhookUrl: 'https://hooks.example.test/workflow',
      }),
    );

    mocks.workflowId = null;
    mocks.createWebhook.mockClear();
    fireEvent.click(screen.getByText('Generate Webhook URL'));
    expect(mocks.createWebhook).not.toHaveBeenCalled();
  });

  it('renders webhook details, copies values, changes auth, and regenerates secret', async () => {
    renderWebhook({
      authType: 'bearer',
      lastTriggeredAt: '2026-05-20T08:00:00.000Z',
      triggerCount: 4,
      webhookSecret: 'bearer-token',
      webhookUrl: 'https://hooks.example.test/workflow',
    });

    expect(
      screen.getByText('https://hooks.example.test/workflow'),
    ).toBeVisible();
    expect(screen.getByText('••••••••••••••••')).toBeVisible();
    expect(screen.getByText('Triggers: 4')).toBeVisible();
    expect(screen.getByText('2026-05-20T08:00:00.000Z')).toBeVisible();
    expect(screen.getByText(/Authorization: Bearer YOUR_TOKEN/)).toBeVisible();

    fireEvent.change(screen.getByLabelText('Authentication'), {
      target: { value: 'none' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('webhook-node', {
      authType: 'none',
    });

    fireEvent.click(screen.getByLabelText('Show secret'));
    expect(screen.getByText('bearer-token')).toBeVisible();
    expect(
      screen.getByText(/Authorization: Bearer bearer-token/),
    ).toBeVisible();

    fireEvent.click(screen.getByLabelText('Copy URL'));
    await waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledWith(
        'https://hooks.example.test/workflow',
      );
    });

    fireEvent.click(screen.getByLabelText('Copy secret'));
    await waitFor(() => {
      expect(mocks.writeText).toHaveBeenCalledWith('bearer-token');
    });

    fireEvent.click(screen.getByLabelText('Regenerate secret'));
    await waitFor(() => {
      expect(mocks.regenerateWebhookSecret).toHaveBeenCalledWith('workflow-1');
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('webhook-node', {
      webhookSecret: 'secret-2',
    });
  });
});
