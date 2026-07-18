import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudImageInputNode } from './CloudImageInputNode';

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

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <picture>
      <img alt={props.alt ?? ''} {...props} />
    </picture>
  ),
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

function renderImageNode(data: Record<string, unknown> = {}) {
  return render(
    <CloudImageInputNode
      id="image-node"
      data={data}
      selected={false}
      type="cloudImage"
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

describe('CloudImageInputNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openPicker.mockImplementation(({ onPick }) => {
      onPick({
        dimensions: { height: 1080, width: 1080 },
        duration: null,
        id: 'image-1',
        itemCategory: 'image',
        label: 'Hero image',
        mimeType: 'image/png',
        resolvedUrl: 'https://example.test/image.png',
        thumbnailUrl: null,
      });
    });
  });

  it('loads image URLs and clears selected URL media', () => {
    renderImageNode({
      config: {
        resolvedUrl: 'https://example.test/original.png',
        source: 'url',
        url: 'https://example.test/original.png',
      },
    });

    expect(screen.getByText('Image Input')).toBeVisible();
    expect(screen.getByAltText('Selected image')).toHaveAttribute(
      'src',
      'https://example.test/original.png',
    );

    fireEvent.change(screen.getByLabelText('Image URL'), {
      target: { value: ' https://example.test/next.png ' },
    });
    fireEvent.click(screen.getByText('Load URL'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'image-node',
      expect.objectContaining({
        image: 'https://example.test/next.png',
        source: 'url',
        url: 'https://example.test/next.png',
      }),
    );

    fireEvent.click(screen.getByText('Clear'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'image-node',
      expect.objectContaining({
        image: null,
        source: 'url',
      }),
    );
  });

  it('opens library and brand-reference pickers with selected metadata', () => {
    const { rerender } = renderImageNode();

    expect(screen.getByText('Pick an image from the gallery.')).toBeVisible();
    fireEvent.click(screen.getByText('Select Media'));
    expect(mocks.openPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedItemId: null,
        source: 'library',
      }),
    );
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'image-node',
      expect.objectContaining({
        image: 'https://example.test/image.png',
        filename: 'Hero image',
      }),
    );

    rerender(
      <CloudImageInputNode
        id="image-node"
        data={{
          config: {
            itemId: 'ref-1',
            resolvedUrl: 'https://example.test/ref.png',
            selectedResolvedUrl: 'https://example.test/ref.png',
            source: 'brand-references',
          },
        }}
        selected={false}
        type="cloudImage"
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

    fireEvent.click(screen.getByText('Select Reference'));
    expect(mocks.openPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedReferenceIds: ['ref-1'],
        source: 'brand-references',
      }),
    );
  });
});
