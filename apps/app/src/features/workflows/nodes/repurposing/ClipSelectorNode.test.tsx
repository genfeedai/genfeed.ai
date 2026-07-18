import '@testing-library/jest-dom/vitest';
import { WorkflowNodeStatus } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipSelectorNode } from './ClipSelectorNode';

const mocks = vi.hoisted(() => ({
  executeNode: vi.fn(),
  updateNodeData: vi.fn(),
}));

vi.mock('@genfeedai/workflows/ui/stores', () => ({
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
  ClockIcon: () => <span>clock</span>,
  ScissorsIcon: () => <span>scissors</span>,
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

function renderClipSelector(data: Record<string, unknown> = {}) {
  return render(
    <ClipSelectorNode
      id="clip-node"
      data={data}
      selected={false}
      type="clipSelector"
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

describe('ClipSelectorNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates clip selection settings and analyzes when inputs are available', () => {
    renderClipSelector({
      inputTranscript: 'Transcript text',
      inputVideo: 'https://example.test/source.mp4',
    });

    expect(screen.getByText('AI Clip Selector')).toBeVisible();
    expect(screen.getByText('Repurposing')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Number of clips'), {
      target: { value: '8' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('clip-node', {
      clipCount: 8,
    });

    fireEvent.change(screen.getByLabelText('Min duration (sec)'), {
      target: { value: '' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('clip-node', {
      clipDuration: { max: 60, min: 15 },
    });

    fireEvent.change(screen.getByLabelText('Max duration (sec)'), {
      target: { value: '90' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('clip-node', {
      clipDuration: { max: 90, min: 15 },
    });

    fireEvent.change(screen.getByLabelText('Selection criteria'), {
      target: { value: 'key_moments' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('clip-node', {
      selectionCriteria: 'key_moments',
    });

    fireEvent.click(screen.getAllByText('toggle')[0]);
    expect(mocks.updateNodeData).toHaveBeenCalledWith('clip-node', {
      includeIntro: false,
    });

    fireEvent.click(screen.getByText('Analyze & Select Clips'));
    expect(mocks.executeNode).toHaveBeenCalledWith('clip-node');
  });

  it('renders selected clips plus processing/help states', () => {
    const { rerender } = renderClipSelector({
      outputClips: [
        {
          endTime: 83,
          reason: 'Strong hook and payoff',
          score: 0.87,
          startTime: 12,
          suggestedCaption: 'Watch this part.',
        },
      ],
    });

    expect(screen.getByText('Selected Clips')).toBeVisible();
    expect(screen.getByText('Clip 1')).toBeVisible();
    expect(screen.getByText(/0:12.*1:23/)).toBeVisible();
    expect(screen.getByText('87%')).toBeVisible();
    expect(screen.getByText('Strong hook and payoff')).toBeVisible();
    expect(screen.getByText(/Watch this part/)).toBeVisible();

    rerender(
      <ClipSelectorNode
        id="clip-node"
        data={{ status: WorkflowNodeStatus.PROCESSING }}
        selected={false}
        type="clipSelector"
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
    expect(screen.getByText('Analyzing video for best clips...')).toBeVisible();

    rerender(
      <ClipSelectorNode
        id="clip-node"
        data={{ inputTranscript: null, inputVideo: null, outputClips: [] }}
        selected={false}
        type="clipSelector"
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
      screen.getByText('Connect a video and transcript to analyze'),
    ).toBeVisible();
  });
});
