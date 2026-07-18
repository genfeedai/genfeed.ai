import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudVideoInputNode } from './CloudVideoInputNode';

const mocks = vi.hoisted(() => ({
  openPicker: vi.fn(),
  updateNodeData: vi.fn(),
}));

vi.mock('@genfeedai/workflows/ui/nodes', () => ({
  BaseNode: ({
    children,
    titleElement,
  }: {
    children?: ReactNode;
    titleElement?: ReactNode;
  }) => (
    <section>
      {titleElement}
      {children}
    </section>
  ),
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

vi.mock('@/features/workflows/nodes/input/useWorkflowMediaPicker', () => ({
  useWorkflowMediaPicker: () => mocks.openPicker,
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
    ...props
  }: React.SelectHTMLAttributes<HTMLSelectElement> & {
    children?: ReactNode;
    label?: string;
  }) => (
    <label>
      {label}
      <select value={value} onChange={onChange} {...props}>
        {children}
      </select>
    </label>
  ),
}));

vi.mock('@/features/workflows/components/ui/status', () => ({
  HelpText: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
}));

function renderVideoNode(data: Record<string, unknown> = {}) {
  return render(
    <CloudVideoInputNode
      id="video-node"
      data={data}
      selected={false}
      type="cloudVideo"
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

describe('CloudVideoInputNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openPicker.mockImplementation(({ onPick }) => {
      onPick({
        dimensions: { height: 1920, width: 1080 },
        duration: 12.4,
        id: 'video-1',
        itemCategory: 'video',
        label: 'Launch clip',
        mimeType: 'video/mp4',
        resolvedUrl: 'https://example.test/video.mp4',
        thumbnailUrl: 'https://example.test/thumb.jpg',
      });
    });
  });

  it('loads video URLs and renders selected video metadata', () => {
    renderVideoNode({
      config: {
        dimensions: { height: 1920, width: 1080 },
        duration: 14.2,
        itemId: 'video-2',
        label: 'Existing video',
        resolvedUrl: 'https://example.test/original.mp4',
        source: 'url',
        url: 'https://example.test/original.mp4',
      },
    });

    expect(screen.getByText('Video Input')).toBeVisible();
    expect(document.querySelector('video')).toHaveAttribute(
      'src',
      'https://example.test/original.mp4',
    );
    expect(screen.getByText('Existing video')).toBeVisible();
    expect(screen.getByText('1080x1920')).toBeVisible();
    expect(screen.getByText('Duration: 14s')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Video URL'), {
      target: { value: ' https://example.test/next.mp4 ' },
    });
    fireEvent.click(screen.getByText('Load URL'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'video-node',
      expect.objectContaining({
        source: 'url',
        url: 'https://example.test/next.mp4',
        video: 'https://example.test/next.mp4',
      }),
    );
  });

  it('opens video pickers and clears selected media', () => {
    const { rerender } = renderVideoNode();

    expect(screen.getByText('Pick a video from the gallery.')).toBeVisible();
    fireEvent.click(screen.getByText('Select Media'));
    expect(mocks.openPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedItemId: null,
        source: 'library',
      }),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'video-node',
      expect.objectContaining({
        filename: 'Launch clip',
        video: 'https://example.test/video.mp4',
      }),
    );

    rerender(
      <CloudVideoInputNode
        id="video-node"
        data={{
          config: {
            resolvedUrl: 'https://example.test/brand-video.mp4',
            selectedResolvedUrl: 'https://example.test/brand-video.mp4',
            source: 'brand-references',
          },
        }}
        selected={false}
        type="cloudVideo"
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

    expect(document.querySelector('video')).toHaveAttribute(
      'src',
      'https://example.test/brand-video.mp4',
    );
    fireEvent.click(screen.getByText('Clear'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'video-node',
      expect.objectContaining({
        source: 'brand-references',
        video: null,
      }),
    );
  });
});
