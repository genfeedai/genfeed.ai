import {
  CredentialPlatform,
  PostVisibility,
  ReleaseStatus,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type { IChannelTarget, IReleaseGroup } from '@genfeedai/interfaces';
import ReleaseRailRow from '@pages/posts/rail/release-rail-row';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function buildTarget(overrides: Partial<IChannelTarget> = {}): IChannelTarget {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    credentialId: 'credential-1',
    executionState: TargetExecutionState.PUBLISHED,
    id: 'target-1',
    isDeleted: false,
    platform: CredentialPlatform.INSTAGRAM,
    releaseId: 'release-1',
    settings: {},
    timezone: 'UTC',
    updatedAt: '2026-01-01T00:00:00.000Z',
    validationIssues: [],
    validationState: TargetValidationState.VALID,
    visibility: PostVisibility.PUBLIC,
    ...overrides,
  } as IChannelTarget;
}

function buildRelease(overrides: Partial<IReleaseGroup> = {}): IReleaseGroup {
  return {
    analyticsComparison: {
      metricDefinitions: [],
      releaseId: 'release-1',
      state: 'empty',
      targets: [],
    },
    baseContent: 'First line of copy\nSecond line',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'release-1',
    isDeleted: false,
    media: [],
    organizationId: 'org-1',
    ownerId: 'user-1',
    status: ReleaseStatus.DRAFT,
    targets: [buildTarget()],
    timezone: 'UTC',
    title: 'Launch post',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as IReleaseGroup;
}

describe('ReleaseRailRow', () => {
  it('renders the title, first line of copy, and target chips', () => {
    render(
      <ReleaseRailRow
        browserTimezone="UTC"
        isActive={false}
        onActivate={vi.fn()}
        release={buildRelease()}
      />,
    );
    expect(screen.getByText('Launch post')).toBeInTheDocument();
    expect(screen.getByText('First line of copy')).toBeInTheDocument();
  });

  it('caps visible target chips and shows the overflow count', () => {
    const targets = Array.from({ length: 8 }, (_unused, index) =>
      buildTarget({ id: `target-${index}` }),
    );
    render(
      <ReleaseRailRow
        browserTimezone="UTC"
        isActive={false}
        onActivate={vi.fn()}
        release={buildRelease({ targets })}
      />,
    );
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('is focusable and marks the active row via aria-selected', () => {
    render(
      <ReleaseRailRow
        browserTimezone="UTC"
        isActive
        onActivate={vi.fn()}
        release={buildRelease()}
      />,
    );
    const row = screen.getByRole('option');
    expect(row).toHaveAttribute('tabIndex', '0');
    expect(row).toHaveAttribute('data-release-id', 'release-1');
    expect(row).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onActivate when the row is clicked', () => {
    const onActivate = vi.fn();
    render(
      <ReleaseRailRow
        browserTimezone="UTC"
        isActive={false}
        onActivate={onActivate}
        release={buildRelease()}
      />,
    );
    screen.getByRole('option').click();
    expect(onActivate).toHaveBeenCalled();
  });
});
