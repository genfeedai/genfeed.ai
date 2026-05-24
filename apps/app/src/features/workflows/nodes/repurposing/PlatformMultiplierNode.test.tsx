import '@testing-library/jest-dom';
import { WorkflowNodeStatus } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformMultiplierNode } from './PlatformMultiplierNode';

const mocks = vi.hoisted(() => ({
  appendChild: vi.fn(),
  click: vi.fn(),
  executeNode: vi.fn(),
  removeChild: vi.fn(),
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
  SelectableButton: ({
    children,
    onClick,
    selected,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    selected?: boolean;
  }) => (
    <button
      data-selected={String(Boolean(selected))}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
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
  CopyIcon: () => <span>copy</span>,
  DownloadIcon: () => <span>download</span>,
  SparklesIcon: () => <span>sparkles</span>,
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

vi.mock('@/features/workflows/components/ui/status', () => ({
  getStatusColor: (status: string) => `status-${status}`,
  HelpText: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  ProcessingMessage: ({ message }: { message: string }) => <p>{message}</p>,
  StatusIcon: ({ status }: { status: string }) => <span>{status}</span>,
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

function renderMultiplier(data: Record<string, unknown> = {}) {
  return render(
    <PlatformMultiplierNode
      id="multiplier-node"
      data={data}
      selected={false}
      type="platformMultiplier"
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

describe('PlatformMultiplierNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      mocks.click,
    );
    vi.spyOn(document.body, 'appendChild');
    vi.spyOn(document.body, 'removeChild');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates target platforms, caption options, and executes generation', () => {
    renderMultiplier({
      inputMedia: 'https://example.test/video.mp4',
      targetPlatforms: ['tiktok'],
    });

    expect(screen.getByText('Platform Multiplier')).toBeVisible();
    expect(screen.getByText('1 platforms')).toBeVisible();

    fireEvent.click(screen.getByText('TikTok'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('multiplier-node', {
      targetPlatforms: [],
    });

    fireEvent.click(screen.getByText('YouTube Shorts'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('multiplier-node', {
      targetPlatforms: ['tiktok', 'youtube_shorts'],
    });

    fireEvent.click(screen.getByText('toggle'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('multiplier-node', {
      generateCaptions: false,
    });

    fireEvent.change(screen.getByLabelText('Caption tone'), {
      target: { value: 'professional' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('multiplier-node', {
      captionTone: 'professional',
    });

    fireEvent.click(screen.getByText('Generate for 1 Platform'));
    expect(mocks.executeNode).toHaveBeenCalledWith('multiplier-node');
  });

  it('renders outputs, downloads media, copies captions, and shows processing/help states', () => {
    const { rerender } = renderMultiplier({
      outputs: [
        {
          caption: 'TikTok caption',
          media: 'https://example.test/tiktok.mp4',
          platform: 'tiktok',
          status: WorkflowNodeStatus.COMPLETE,
        },
        {
          error: 'Render failed',
          platform: 'youtube_shorts',
          status: WorkflowNodeStatus.ERROR,
        },
      ],
    });

    expect(screen.getByText('1/2 complete')).toBeVisible();
    expect(screen.getAllByText('TikTok').length).toBeGreaterThan(0);
    expect(screen.getAllByText('YouTube Shorts').length).toBeGreaterThan(0);
    expect(screen.getByText('Render failed')).toBeVisible();

    vi.mocked(document.body.appendChild).mockClear();
    vi.mocked(document.body.removeChild).mockClear();
    fireEvent.click(screen.getByText('Download'));
    expect(mocks.click).toHaveBeenCalledTimes(1);
    expect(document.body.appendChild).toHaveBeenCalledTimes(1);
    expect(document.body.removeChild).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Copy caption'));
    expect(mocks.writeText).toHaveBeenCalledWith('TikTok caption');

    rerender(
      <PlatformMultiplierNode
        id="multiplier-node"
        data={{ status: WorkflowNodeStatus.PROCESSING }}
        selected={false}
        type="platformMultiplier"
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
    expect(screen.getByText('Generating platform versions...')).toBeVisible();

    rerender(
      <PlatformMultiplierNode
        id="multiplier-node"
        data={{ inputMedia: null, outputs: [] }}
        selected={false}
        type="platformMultiplier"
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
    expect(screen.getByText('Connect a video to multiply')).toBeVisible();
  });
});
