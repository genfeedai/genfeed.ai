// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'actions.retry' ? 'Retry' : key,
}));

import PublishingOverviewAsyncSection from './PublishingOverviewAsyncSection';

describe('PublishingOverviewAsyncSection', () => {
  it('announces loading without rendering successful content', () => {
    render(
      <PublishingOverviewAsyncSection
        errorMessage="Could not load."
        loadingLabel="Loading accounts"
        onRetry={vi.fn()}
        state={{ status: 'loading' }}
      >
        {() => <p>Loaded</p>}
      </PublishingOverviewAsyncSection>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading accounts');
    expect(screen.queryByText('Loaded')).not.toBeInTheDocument();
  });

  it('announces errors and retries the failed source', () => {
    const onRetry = vi.fn();
    render(
      <PublishingOverviewAsyncSection
        errorMessage="Could not load."
        loadingLabel="Loading accounts"
        onRetry={onRetry}
        state={{ error: new Error('network'), status: 'error' }}
      >
        {() => <p>Loaded</p>}
      </PublishingOverviewAsyncSection>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders successful data', () => {
    render(
      <PublishingOverviewAsyncSection
        errorMessage="Could not load."
        loadingLabel="Loading accounts"
        onRetry={vi.fn()}
        state={{ data: ['one', 'two'], status: 'success' }}
      >
        {(items) => <p>{items.join(', ')}</p>}
      </PublishingOverviewAsyncSection>,
    );

    expect(screen.getByText('one, two')).toBeVisible();
  });
});
