import '@testing-library/jest-dom/vitest';
import type { ArtifactVersionPin } from '@props/modals/artifact-history-overlay.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArtifactHistoryOverlay from './artifact-history-overlay';

const versions: ArtifactVersionPin[] = [
  {
    id: 'v3',
    isCurrent: true,
    isImmutable: true,
    label: 'v3',
    subtitle: 'Approved scope ready',
    title: 'Current · immutable',
  },
  {
    id: 'v2',
    isCurrent: false,
    isImmutable: true,
    label: 'v2',
    subtitle: 'Founder voice refinement',
    title: 'Previous',
  },
  {
    id: 'v1',
    isCurrent: false,
    isImmutable: true,
    label: 'v1',
    subtitle: 'First generated carousel',
    title: 'Initial',
  },
];

function setup(
  overrides: Partial<Parameters<typeof ArtifactHistoryOverlay>[0]> = {},
) {
  const onApprove = vi.fn();
  const onOpenVersion = vi.fn();
  const onOpenChange = vi.fn();

  render(
    <ArtifactHistoryOverlay
      currentVersionId="v3"
      isApproving={false}
      isOpen
      onApprove={onApprove}
      onOpenChange={onOpenChange}
      onOpenVersion={onOpenVersion}
      versions={versions}
      {...overrides}
    />,
  );

  return { onApprove, onOpenChange, onOpenVersion };
}

describe('ArtifactHistoryOverlay', () => {
  it('renders every version pin and marks the current one immutable', () => {
    setup();

    expect(screen.getByText('Artifact history')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getAllByText('Current · immutable')).toHaveLength(2);
  });

  it('approves the current immutable version from the primary CTA', () => {
    const { onApprove } = setup();

    fireEvent.click(screen.getByRole('button', { name: /approve v3/i }));

    expect(onApprove).toHaveBeenCalledWith('v3');
  });

  it('opens a prior version read-only without approving it', () => {
    const { onApprove, onOpenVersion } = setup();

    fireEvent.click(screen.getByRole('button', { name: /previous/i }));

    expect(onOpenVersion).toHaveBeenCalledWith('v2');
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('exposes no open affordance on the current immutable version', () => {
    setup();

    // The current row is a static card, not a button — only prior versions and
    // the footer are actionable. This is the single "open" affordance rule.
    expect(
      screen.queryByRole('button', { name: /current · immutable/i }),
    ).toBeNull();
  });

  it('disables approval while a decision is in flight', () => {
    setup({ isApproving: true });

    expect(screen.getByRole('button', { name: /approving/i })).toBeDisabled();
  });
});
