import '@testing-library/jest-dom/vitest';
import { WorkflowNodeStatus } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectColorGradeNode } from './EffectColorGradeNode';

const mocks = vi.hoisted(() => ({
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

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
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

function renderColorGrade(data: Record<string, unknown> = {}) {
  return render(
    <EffectColorGradeNode
      id="color-node"
      data={data}
      selected={false}
      type="effectColorGrade"
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

describe('EffectColorGradeNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates mode and preset configuration', () => {
    renderColorGrade();

    expect(screen.getByText('Color Grade')).toBeVisible();
    expect(screen.getByText('instagram-warm')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Mode'), {
      target: { value: 'custom' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('color-node', {
      mode: 'custom',
    });

    fireEvent.change(screen.getByLabelText('Preset'), {
      target: { value: 'instagram-cool' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('color-node', {
      preset: 'instagram-cool',
    });
  });

  it('updates custom sliders and AI style reference', () => {
    const { rerender } = renderColorGrade({ mode: 'custom', warmth: 60 });

    expect(screen.getByText('Warmth')).toBeVisible();
    expect(screen.getByText('Contrast')).toBeVisible();
    fireEvent.change(screen.getByDisplayValue('60'), {
      target: { value: '74' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('color-node', {
      warmth: 74,
    });

    rerender(
      <EffectColorGradeNode
        id="color-node"
        data={{
          mode: 'ai-style',
          styleReferenceImage: 'https://example.test/style.jpg',
        }}
        selected={false}
        type="effectColorGrade"
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

    fireEvent.change(screen.getByLabelText('Style Reference Image URL'), {
      target: { value: '' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('color-node', {
      styleReferenceImage: null,
    });
  });

  it('renders input preview, output, processing, and help states', () => {
    const { rerender } = renderColorGrade({
      inputImage: 'https://example.test/input.jpg',
      outputImage: 'https://example.test/output.jpg',
    });

    expect(screen.getAllByTestId('media-preview')).toHaveLength(2);
    expect(screen.getByText('Color grading applied')).toBeVisible();

    rerender(
      <EffectColorGradeNode
        id="color-node"
        data={{ status: WorkflowNodeStatus.PROCESSING }}
        selected={false}
        type="effectColorGrade"
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
    expect(screen.getByText('Applying color grade...')).toBeVisible();

    rerender(
      <EffectColorGradeNode
        id="color-node"
        data={{ outputImage: null }}
        selected={false}
        type="effectColorGrade"
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
      screen.getByText('Connect an image to apply color grading'),
    ).toBeVisible();
  });
});
