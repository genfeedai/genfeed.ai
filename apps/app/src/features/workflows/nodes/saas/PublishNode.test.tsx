import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishNode } from './PublishNode';

const mocks = vi.hoisted(() => ({
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

vi.mock('@/features/workflows/components/ui/badge', () => ({
  NodeBadge: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/features/workflows/components/ui/button', () => ({
  SelectableButton: ({
    children,
    onClick,
    selected,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    selected?: boolean;
  }) => (
    <button aria-pressed={selected} type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@/features/workflows/components/ui/card', () => ({
  NodeCard: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  NodeHeader: ({
    badge,
    icon,
    title,
  }: {
    badge?: ReactNode;
    icon?: ReactNode;
    title: string;
  }) => (
    <header>
      {icon}
      <h2>{title}</h2>
      {badge}
    </header>
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
  NodeTextarea: ({
    label,
    onChange,
    value,
    ...props
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    label?: string;
  }) => (
    <label>
      {label}
      <textarea value={value ?? ''} onChange={onChange} {...props} />
    </label>
  ),
}));

vi.mock('@/features/workflows/components/ui/status', () => ({
  HelpText: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  ProcessingMessage: ({ message }: { message: string }) => <p>{message}</p>,
}));

function renderPublish(data: Record<string, unknown> = {}) {
  return render(
    <PublishNode
      id="publish-node"
      data={data}
      selected={false}
      type="publish"
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

describe('PublishNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates platform and schedule configuration', () => {
    renderPublish();

    expect(screen.getByText('Publish')).toBeVisible();
    expect(screen.getByText('Select at least one platform')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Instagram' }));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('publish-node', {
      platforms: {
        instagram: true,
        linkedin: false,
        tiktok: false,
        twitter: false,
      },
    });

    fireEvent.change(screen.getByLabelText('Schedule'), {
      target: { value: 'scheduled' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('publish-node', {
      schedule: { type: 'scheduled' },
    });
  });

  it('updates scheduled time, caption, and hashtags', () => {
    renderPublish({
      caption: 'Launch caption',
      hashtags: ['ai'],
      schedule: { datetime: '2026-05-20T10:30', type: 'scheduled' },
    });

    fireEvent.change(screen.getByLabelText('Date & Time'), {
      target: { value: '' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('publish-node', {
      schedule: { datetime: undefined, type: 'scheduled' },
    });

    fireEvent.change(screen.getByLabelText('Caption'), {
      target: { value: 'Updated caption' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('publish-node', {
      caption: 'Updated caption',
    });

    fireEvent.change(screen.getByLabelText('Hashtags (comma-separated)'), {
      target: { value: 'ai, content, , launch' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('publish-node', {
      hashtags: ['ai', 'content', 'launch'],
    });
  });

  it('renders published links, processing state, and empty help', () => {
    const { rerender } = renderPublish({
      platforms: {
        instagram: true,
        linkedin: false,
        tiktok: false,
        twitter: false,
      },
      publishedUrls: [
        'https://instagram.example.test/post-1',
        'https://linkedin.example.test/post-1',
      ],
    });

    expect(screen.getByText('Published')).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: 'https://instagram.example.test/post-1',
      }),
    ).toHaveAttribute('href', 'https://instagram.example.test/post-1');

    rerender(
      <PublishNode
        id="publish-node"
        data={{ status: 'processing' }}
        selected={false}
        type="publish"
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
    expect(screen.getByText('Publishing content...')).toBeVisible();

    rerender(
      <PublishNode
        id="publish-node"
        data={{ publishedUrls: [] }}
        selected={false}
        type="publish"
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
      screen.getByText('Select platforms and connect media to publish'),
    ).toBeVisible();
  });
});
