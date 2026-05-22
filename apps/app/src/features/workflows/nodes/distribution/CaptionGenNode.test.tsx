import '@testing-library/jest-dom';
import { WorkflowNodeStatus } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptionGenNode } from './CaptionGenNode';

const mocks = vi.hoisted(() => ({
  executeNode: vi.fn(),
  updateNodeData: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  selectUpdateNodeData: (state: {
    updateNodeData: typeof mocks.updateNodeData;
  }) => state.updateNodeData,
  useWorkflowStore: (
    selector: (state: {
      updateNodeData: typeof mocks.updateNodeData;
    }) => unknown,
  ) => selector({ updateNodeData: mocks.updateNodeData }),
}));

vi.mock('@/features/workflows/hooks/useNodeExecution', () => ({
  useNodeExecution: () => ({
    executeNode: mocks.executeNode,
  }),
}));

vi.mock('@/features/workflows/components/ui/badge', () => ({
  NodeBadge: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/features/workflows/components/ui/button', () => ({
  NodeButton: ({
    children,
    disabled,
    onClick,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} type="button" onClick={onClick}>
      {children}
    </button>
  ),
  NodeIconButton: ({
    children,
    disabled,
    onClick,
    title,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    title?: string;
  }) => (
    <button
      aria-label={title}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/features/workflows/components/ui/card', () => ({
  NodeCard: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  NodeHeader: ({ badge, title }: { badge?: ReactNode; title: string }) => (
    <header>
      <h2>{title}</h2>
      {badge}
    </header>
  ),
}));

vi.mock('@/features/workflows/components/ui/icons', () => ({
  CopyIcon: () => <span>copy</span>,
  HashIcon: () => <span>hash</span>,
  RefreshIcon: () => <span>refresh</span>,
  SparklesIcon: () => <span>sparkles</span>,
}));

vi.mock('@/features/workflows/components/ui/inputs', () => ({
  NodeInput: ({
    label,
    onChange,
    value,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) => (
    <label>
      {label}
      <input value={value ?? ''} onChange={onChange} {...props} />
    </label>
  ),
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

vi.mock('@/features/workflows/components/ui/status', () => ({
  HelpText: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  ProcessingMessage: ({ message }: { message: string }) => <p>{message}</p>,
}));

vi.mock('@/features/workflows/components/ui/toggle/Toggle', () => ({
  default: ({
    checked,
    onChange,
  }: {
    checked?: boolean;
    onChange?: () => void;
  }) => (
    <button
      data-checked={String(Boolean(checked))}
      type="button"
      onClick={onChange}
    >
      toggle
    </button>
  ),
}));

function renderCaption(data: Record<string, unknown> = {}) {
  return render(
    <CaptionGenNode
      id="caption-node"
      data={data}
      selected={false}
      type="caption"
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

describe('CaptionGenNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  it('updates caption generation settings and executes when context is available', () => {
    renderCaption({ inputContext: 'Launch context' });

    expect(screen.getByText('Caption Generator')).toBeVisible();
    expect(screen.getByText('AI')).toBeVisible();
    expect(screen.getByText(/Max: 2,200 characters/)).toBeVisible();

    fireEvent.change(screen.getByLabelText('Platform'), {
      target: { value: 'tiktok' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('caption-node', {
      maxLength: expect.any(Number),
      platform: 'tiktok',
    });

    fireEvent.change(screen.getByLabelText('Tone'), {
      target: { value: 'professional' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('caption-node', {
      tone: 'professional',
    });

    fireEvent.click(screen.getAllByText('toggle')[0]);
    expect(mocks.updateNodeData).toHaveBeenCalledWith('caption-node', {
      includeHashtags: false,
    });

    fireEvent.change(screen.getByLabelText('Number of hashtags'), {
      target: { value: '12' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('caption-node', {
      hashtagCount: 12,
    });

    fireEvent.click(screen.getByText('Generate Caption'));
    expect(mocks.executeNode).toHaveBeenCalledWith('caption-node');
  });

  it('renders output, copies captions, regenerates, and shows processing/help states', () => {
    const { rerender } = renderCaption({
      outputCaption: `${'x'.repeat(2300)}`,
      outputHashtags: ['launch', 'ai'],
      status: WorkflowNodeStatus.IDLE,
    });

    expect(screen.getByText('#launch #ai')).toBeVisible();
    expect(screen.getByText('2,300 / 2,200')).toHaveClass('text-red-500');

    fireEvent.click(screen.getByLabelText('Copy to clipboard'));
    expect(mocks.writeText).toHaveBeenCalledWith('x'.repeat(2300));

    fireEvent.click(screen.getByLabelText('Regenerate'));
    expect(mocks.executeNode).toHaveBeenCalledWith('caption-node');

    rerender(
      <CaptionGenNode
        id="caption-node"
        data={{ status: WorkflowNodeStatus.PROCESSING }}
        selected={false}
        type="caption"
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
    expect(screen.getByText('Generating caption...')).toBeVisible();

    rerender(
      <CaptionGenNode
        id="caption-node"
        data={{ includeHashtags: false, includeCTA: false, inputContext: null }}
        selected={false}
        type="caption"
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
    expect(
      screen.getByText('Connect a context or prompt input to generate'),
    ).toBeVisible();
  });
});
