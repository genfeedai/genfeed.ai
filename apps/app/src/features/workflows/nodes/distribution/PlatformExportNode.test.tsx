import '@testing-library/jest-dom/vitest';
import { WorkflowNodeStatus } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformExportNode } from './PlatformExportNode';

const mocks = vi.hoisted(() => ({
  click: vi.fn(),
  updateNodeData: vi.fn(),
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
  CheckCircleIcon: () => <span>check</span>,
  DownloadIcon: () => <span>download</span>,
  PlatformIcon: ({ type }: { type: string }) => <span>{type}</span>,
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

vi.mock('@/features/workflows/components/ui/media', () => ({
  MediaPreview: ({ src, type }: { src: string; type?: string | null }) => (
    <div data-testid="media-preview">
      {type}:{src}
    </div>
  ),
}));

vi.mock('@/features/workflows/components/ui/status', () => ({
  HelpText: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  ProcessingMessage: ({ message }: { message: string }) => <p>{message}</p>,
}));

function renderExport(data: Record<string, unknown> = {}) {
  return render(
    <PlatformExportNode
      id="export-node"
      data={data}
      selected={false}
      type="platformExport"
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

describe('PlatformExportNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      mocks.click,
    );
    vi.spyOn(document.body, 'appendChild');
    vi.spyOn(document.body, 'removeChild');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates platform and custom dimensions', () => {
    renderExport({ platform: 'custom' });

    expect(screen.getByText('Platform Export')).toBeVisible();
    expect(screen.getByText('1920x1080')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Target Platform'), {
      target: { value: 'tiktok' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('export-node', {
      platform: 'tiktok',
    });

    fireEvent.change(screen.getByLabelText('Width'), {
      target: { value: '1280' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('export-node', {
      customWidth: 1280,
    });

    fireEvent.change(screen.getByLabelText('Height'), {
      target: { value: '' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('export-node', {
      customHeight: undefined,
    });
  });

  it('renders media, processing/help states, and downloads exported output', () => {
    const { rerender } = renderExport({
      inputMedia: 'https://example.test/input.mp4',
      inputType: 'video',
      outputMedia: 'https://example.test/output.mp4',
      platform: 'tiktok',
    });

    expect(screen.getByTestId('media-preview')).toHaveTextContent(
      'video:https://example.test/input.mp4',
    );
    expect(screen.getByText('Export Ready')).toBeVisible();
    fireEvent.click(screen.getByText('Download for TikTok'));
    expect(mocks.click).toHaveBeenCalledTimes(1);

    rerender(
      <PlatformExportNode
        id="export-node"
        data={{
          platform: 'instagram_post',
          status: WorkflowNodeStatus.PROCESSING,
        }}
        selected={false}
        type="platformExport"
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
    expect(screen.getByText('Encoding for Instagram Post...')).toBeVisible();

    rerender(
      <PlatformExportNode
        id="export-node"
        data={{ outputMedia: null }}
        selected={false}
        type="platformExport"
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
    expect(screen.getByText('Connect media to export')).toBeVisible();
  });
});
