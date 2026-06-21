import type { FastlaneAssetItem } from '@genfeedai/interfaces';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FastlaneBlitz from './FastlaneBlitz';

function makeAsset(id: string, hook: string): FastlaneAssetItem {
  return {
    idea: {
      id,
      format: 'image',
      hook,
      caption: `${hook} caption`,
      visualPrompt: `${hook} prompt`,
      platformHints: ['tiktok'],
    },
    ingredientId: id,
    status: 'ready',
  };
}

/**
 * Mirrors FastlaneLayout: it owns the approval overlay and re-derives the asset
 * list so an approved/rejected asset drops out of the `ready` set. Reviewing
 * through this harness is what surfaces the skip bug — the real parent shrinks
 * the list on every swipe.
 */
function Harness({ initial }: { initial: FastlaneAssetItem[] }) {
  const [approvals, setApprovals] = useState<
    Record<string, 'approved' | 'rejected'>
  >({});
  const enriched = initial.map((a) =>
    approvals[a.idea.id] ? { ...a, status: approvals[a.idea.id] } : a,
  );
  return (
    <FastlaneBlitz
      assets={enriched}
      failedCount={0}
      isGenerating={false}
      onApprove={(id) =>
        setApprovals((prev) => ({ ...prev, [id]: 'approved' }))
      }
      onReject={(id) => setApprovals((prev) => ({ ...prev, [id]: 'rejected' }))}
      onDone={vi.fn()}
    />
  );
}

function settleSwipe() {
  // The swipe animation defers the approve/reject + advance by 250ms.
  act(() => {
    vi.advanceTimersByTime(260);
  });
}

describe('FastlaneBlitz', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('shows the generating state when nothing is ready yet', () => {
    render(
      <FastlaneBlitz
        assets={[]}
        failedCount={0}
        isGenerating={true}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByText(/generating your assets/i)).toBeTruthy();
  });

  it('reviews every asset in order without skipping (regression: skip-every-other)', () => {
    render(
      <Harness
        initial={[
          makeAsset('a', 'Hook A'),
          makeAsset('b', 'Hook B'),
          makeAsset('c', 'Hook C'),
        ]}
      />,
    );

    // First card is A.
    expect(screen.getByText('Hook A')).toBeTruthy();
    expect(screen.getByText('1 / 3 — ← reject · approve →')).toBeTruthy();

    // Approve A → the very next card must be B, not C.
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    settleSwipe();
    expect(screen.getByText('Hook B')).toBeTruthy();
    expect(screen.queryByText('Hook C')).toBeNull();
    expect(screen.getByText('2 / 3 — ← reject · approve →')).toBeTruthy();

    // Approve B → C.
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    settleSwipe();
    expect(screen.getByText('Hook C')).toBeTruthy();
  });

  it('advances on keyboard arrows and reaches the complete state', () => {
    render(
      <Harness
        initial={[makeAsset('a', 'Hook A'), makeAsset('b', 'Hook B')]}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    settleSwipe();
    expect(screen.getByText('Hook B')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    settleSwipe();

    // One approved (A) means the schedule CTA is offered on completion.
    expect(screen.getByText(/review complete/i)).toBeTruthy();
    expect(screen.getByText('1 approved')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /schedule approved/i }),
    ).toBeTruthy();
  });

  it('ignores a second swipe while one is mid-animation', () => {
    const onApprove = vi.fn();
    render(
      <FastlaneBlitz
        assets={[makeAsset('a', 'Hook A'), makeAsset('b', 'Hook B')]}
        failedCount={0}
        isGenerating={false}
        onApprove={onApprove}
        onReject={vi.fn()}
        onDone={vi.fn()}
      />,
    );

    const approve = screen.getByRole('button', { name: /approve/i });
    fireEvent.click(approve);
    // Second click before the 250ms settle must be a no-op (swipe in progress).
    fireEvent.click(approve);
    settleSwipe();

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith('a');
  });
});
