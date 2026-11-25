import '@testing-library/jest-dom/vitest';
import { TargetExecutionState } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReleaseTargetStateBadge from '@/features/posts/shared/ReleaseTargetStateBadge';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('ReleaseTargetStateBadge', () => {
  it('reads Delivered for an Inbox receipt stored as published', () => {
    render(
      <ReleaseTargetStateBadge
        executionState={TargetExecutionState.PUBLISHED}
        isInboxDelivery
      />,
    );

    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.queryByText(/^published$/i)).not.toBeInTheDocument();
  });

  it('keeps the execution-state label for a post that is live', () => {
    render(
      <ReleaseTargetStateBadge
        executionState={TargetExecutionState.PUBLISHED}
      />,
    );

    expect(screen.getByText(/published/i)).toBeInTheDocument();
    expect(screen.queryByText('Delivered')).not.toBeInTheDocument();
  });
});
