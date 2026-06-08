import '@testing-library/jest-dom/vitest';
import { NotificationChannel, ReviewGateStatus } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewGateNode } from './ReviewGateNode';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  loggerError: vi.fn(),
  submitApproval: vi.fn(),
  updateNodeData: vi.fn(),
  workflowId: 'workflow-1' as string | null,
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

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@/features/workflows/hooks/useNodeExecution', () => ({
  useNodeExecution: () => ({
    getService: mocks.getService,
  }),
}));

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: ({
    fallback,
    value,
  }: {
    fallback: string;
    value?: string | null;
  }) => <time>{value ?? fallback}</time>,
}));

vi.mock('@/features/workflows/components/ui/badge', () => ({
  NodeBadge: ({
    children,
    variant,
  }: {
    children?: ReactNode;
    variant: string;
  }) => <span data-variant={variant}>{children}</span>,
}));

vi.mock('@/features/workflows/components/ui/button', () => ({
  NodeButton: ({
    children,
    onClick,
    variant,
  }: {
    children?: ReactNode;
    onClick?: () => void;
    variant?: string;
  }) => (
    <button data-variant={variant} type="button" onClick={onClick}>
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

vi.mock('@/features/workflows/components/ui/card', () => ({
  NodeCard: ({
    children,
    minWidth,
  }: {
    children?: ReactNode;
    minWidth?: string;
  }) => <section data-min-width={minWidth}>{children}</section>,
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
  ClockIcon: () => <span>clock</span>,
  MailIcon: () => <span>mail</span>,
  ShieldCheckIcon: () => <span>shield</span>,
  SlackIcon: () => <span>slack-icon</span>,
  WebhookIcon: () => <span>webhook-icon</span>,
  XIcon: () => <span>x</span>,
}));

vi.mock('@/features/workflows/components/ui/inputs', () => ({
  NodeInput: ({
    onChange,
    placeholder,
    value,
    type,
  }: {
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    type?: string;
    value?: string | number | null;
  }) => (
    <input
      placeholder={placeholder}
      type={type}
      value={value ?? ''}
      onChange={onChange}
    />
  ),
}));

vi.mock('@/features/workflows/components/ui/media', () => ({
  MediaPreview: ({
    controls,
    src,
    type,
  }: {
    controls?: boolean;
    src: string;
    type?: string | null;
  }) => (
    <div data-controls={String(Boolean(controls))} data-testid="media-preview">
      {type}:{src}
    </div>
  ),
}));

vi.mock('@/features/workflows/components/ui/status', () => ({
  HelpText: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
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

function renderReviewGate(data: Record<string, unknown> = {}) {
  return render(
    <ReviewGateNode
      id="review-node"
      data={data}
      selected={false}
      type="reviewGate"
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

describe('ReviewGateNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workflowId = 'workflow-1';
    mocks.submitApproval.mockResolvedValue({
      approvedAt: '2026-05-20T07:00:00.000Z',
      approvedBy: 'Ada',
    });
    mocks.getService.mockResolvedValue({
      submitApproval: mocks.submitApproval,
    });
  });

  it('renders pending review content and updates notification settings', () => {
    renderReviewGate({
      approvalId: 'approval-1',
      approvalStatus: ReviewGateStatus.PENDING,
      autoApproveIfNoResponse: false,
      inputCaption: 'Approve this launch video',
      inputMedia: 'https://example.test/video.mp4',
      inputType: 'video',
      notifyChannels: [NotificationChannel.EMAIL],
      notifyEmail: 'reviewer@example.test',
      timeoutHours: 12,
    });

    expect(screen.getByText('Review Gate')).toBeVisible();
    expect(screen.getByText('Pending')).toBeVisible();
    expect(screen.getByTestId('media-preview')).toHaveAttribute(
      'data-controls',
      'true',
    );
    expect(screen.getByText('Approve this launch video')).toBeVisible();
    expect(screen.getByDisplayValue('reviewer@example.test')).toBeVisible();

    fireEvent.click(screen.getByText('Slack'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('review-node', {
      notifyChannels: [NotificationChannel.EMAIL, NotificationChannel.SLACK],
    });

    fireEvent.click(screen.getByText('Email'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('review-node', {
      notifyChannels: [],
    });

    fireEvent.change(screen.getByDisplayValue('reviewer@example.test'), {
      target: { value: 'editor@example.test' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('review-node', {
      notifyEmail: 'editor@example.test',
    });

    fireEvent.change(screen.getByDisplayValue('12'), {
      target: { value: '0' },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('review-node', {
      timeoutHours: 24,
    });

    fireEvent.click(screen.getByText('toggle'));
    expect(mocks.updateNodeData).toHaveBeenCalledWith('review-node', {
      autoApproveIfNoResponse: true,
    });
  });

  it('submits approval and rejection decisions', async () => {
    const baseData = {
      approvalId: 'approval-1',
      approvalStatus: ReviewGateStatus.PENDING,
      inputCaption: 'Launch caption',
      inputMedia: 'https://example.test/image.png',
      inputType: 'image',
      notifyChannels: [],
    };

    const { rerender } = render(
      <ReviewGateNode
        id="review-node"
        data={baseData}
        selected={false}
        type="reviewGate"
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

    fireEvent.click(screen.getByText('Approve'));
    await waitFor(() => {
      expect(mocks.submitApproval).toHaveBeenCalledWith(
        'workflow-1',
        'approval-1',
        'review-node',
        true,
      );
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'review-node',
      expect.objectContaining({
        approvalStatus: ReviewGateStatus.APPROVED,
        approvedAt: '2026-05-20T07:00:00.000Z',
        approvedBy: 'Ada',
        outputCaption: 'Launch caption',
        outputMedia: 'https://example.test/image.png',
      }),
    );

    mocks.submitApproval.mockClear();
    rerender(
      <ReviewGateNode
        id="review-node"
        data={baseData}
        selected={false}
        type="reviewGate"
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

    fireEvent.click(screen.getByText('Reject'));
    await waitFor(() => {
      expect(mocks.submitApproval).toHaveBeenCalledWith(
        'workflow-1',
        'approval-1',
        'review-node',
        false,
        'Rejected via review gate',
      );
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'review-node',
      expect.objectContaining({
        approvalStatus: ReviewGateStatus.REJECTED,
        rejectionReason: 'Rejected via review gate',
      }),
    );
  });

  it('handles missing execution context and approval failures', async () => {
    mocks.workflowId = null;
    renderReviewGate({
      approvalId: 'approval-1',
      approvalStatus: ReviewGateStatus.PENDING,
      inputCaption: 'Needs review',
      notifyChannels: [],
    });

    fireEvent.click(screen.getByText('Approve'));
    expect(mocks.getService).not.toHaveBeenCalled();

    mocks.workflowId = 'workflow-1';
    mocks.submitApproval.mockRejectedValueOnce(new Error('approval failed'));
    fireEvent.click(screen.getByText('Reject'));

    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Review gate rejection failed',
        expect.objectContaining({
          approvalId: 'approval-1',
          nodeId: 'review-node',
          workflowId: 'workflow-1',
        }),
      );
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('review-node', {
      error: 'approval failed',
      status: 'error',
    });
  });

  it('renders terminal states and pending wait messages', () => {
    const { rerender } = render(
      <ReviewGateNode
        id="review-node"
        data={{
          approvalStatus: ReviewGateStatus.APPROVED,
          approvedAt: '2026-05-20T07:00:00.000Z',
          approvedBy: 'Ada',
        }}
        selected={false}
        type="reviewGate"
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

    expect(screen.getByText('Approved')).toBeVisible();
    expect(screen.getByText(/Approved by Ada at/)).toBeVisible();
    expect(screen.getByText('2026-05-20T07:00:00.000Z')).toBeVisible();

    rerender(
      <ReviewGateNode
        id="review-node"
        data={{
          approvalStatus: ReviewGateStatus.REJECTED,
          error: 'Review service unavailable',
          rejectionReason: '',
        }}
        selected={false}
        type="reviewGate"
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
    expect(screen.getByText('Rejected')).toBeVisible();
    expect(screen.getByText('No reason provided')).toBeVisible();
    expect(screen.getByText('Review service unavailable')).toBeVisible();

    rerender(
      <ReviewGateNode
        id="review-node"
        data={{ approvalStatus: ReviewGateStatus.PENDING }}
        selected={false}
        type="reviewGate"
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
    expect(screen.getByText('Waiting for content to review…')).toBeVisible();

    rerender(
      <ReviewGateNode
        id="review-node"
        data={{
          approvalStatus: ReviewGateStatus.PENDING,
          inputCaption: 'Ready',
        }}
        selected={false}
        type="reviewGate"
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
      screen.getByText(
        'Waiting for the active execution to attach approval context…',
      ),
    ).toBeVisible();
  });
});
