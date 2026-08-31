import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setInspectorOpen = vi.fn();
const setPageContext = vi.fn();
const useRegisterWorkspaceSurfaceAdapter = vi.fn();
const useRegisterWorkspaceSurfacePresentationAdapter = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1', organizationId: 'org-1' }),
}));

vi.mock('@genfeedai/agent', () => ({
  useAgentChatStore: Object.assign(
    (selector: (state: { setPageContext: typeof setPageContext }) => unknown) =>
      selector({ setPageContext }),
    {
      getState: () => ({
        pageContext: {
          route: '/acme/brand/publishing/review',
          suggestedActions: [],
        },
      }),
    },
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/brand/publishing/review',
}));

vi.mock('@/components/workspace-shell/WorkspaceInspectorContext', () => ({
  useWorkspaceInspector: () => ({
    isOpen: false,
    setIsOpen: setInspectorOpen,
  }),
}));

vi.mock('@/components/workspace-shell/WorkspaceSurfaceAdapterContext', () => ({
  useRegisterWorkspaceSurfaceAdapter: (...args: unknown[]) =>
    useRegisterWorkspaceSurfaceAdapter(...args),
  useRegisterWorkspaceSurfacePresentationAdapter: (...args: unknown[]) =>
    useRegisterWorkspaceSurfacePresentationAdapter(...args),
}));

vi.mock('./ReviewDetailPanel', () => ({
  default: function MockReviewDetailPanel() {
    return <div data-testid="review-detail-panel" />;
  },
}));

import ReviewWorkspaceSurfaceAdapter from './ReviewWorkspaceSurfaceAdapter';

const baseItem = {
  batchId: 'batch-1',
  caption: 'Ship the review rail',
  createdAt: '2026-03-10T10:00:00.000Z',
  format: 'image',
  id: 'item-1',
  platform: 'twitter',
  status: 'COMPLETED',
};

describe('ReviewWorkspaceSurfaceAdapter', () => {
  beforeEach(() => {
    setInspectorOpen.mockReset();
    setPageContext.mockReset();
    useRegisterWorkspaceSurfaceAdapter.mockReset();
    useRegisterWorkspaceSurfacePresentationAdapter.mockReset();
  });

  it('opens Context when the selected review row changes', async () => {
    const { rerender } = render(
      <ReviewWorkspaceSurfaceAdapter
        activeItem={null}
        isActioning={false}
        isSelected={false}
        onApprove={vi.fn()}
        onAssign={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onToggleSelect={vi.fn()}
        onUnassign={vi.fn()}
      />,
    );

    rerender(
      <ReviewWorkspaceSurfaceAdapter
        activeItem={baseItem as never}
        isActioning={false}
        isSelected
        onApprove={vi.fn()}
        onAssign={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onToggleSelect={vi.fn()}
        onUnassign={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(setInspectorOpen).toHaveBeenCalledWith(true);
    });
  });

  it('does not re-open Context when the same row stays selected', async () => {
    const { rerender } = render(
      <ReviewWorkspaceSurfaceAdapter
        activeItem={baseItem as never}
        isActioning={false}
        isSelected
        onApprove={vi.fn()}
        onAssign={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onToggleSelect={vi.fn()}
        onUnassign={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(setInspectorOpen).toHaveBeenCalledWith(true);
    });
    setInspectorOpen.mockClear();

    rerender(
      <ReviewWorkspaceSurfaceAdapter
        activeItem={{ ...baseItem, caption: 'same id, new caption' } as never}
        isActioning={false}
        isSelected
        onApprove={vi.fn()}
        onAssign={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onToggleSelect={vi.fn()}
        onUnassign={vi.fn()}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(setInspectorOpen).not.toHaveBeenCalled();
  });

  it('force-opens Context on workspace:force-open-review-context', async () => {
    render(
      <ReviewWorkspaceSurfaceAdapter
        activeItem={baseItem as never}
        isActioning={false}
        isSelected
        onApprove={vi.fn()}
        onAssign={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onToggleSelect={vi.fn()}
        onUnassign={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(setInspectorOpen).toHaveBeenCalled();
    });
    setInspectorOpen.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('workspace:force-open-review-context'),
      );
    });

    expect(setInspectorOpen).toHaveBeenCalledWith(true);
  });
});
