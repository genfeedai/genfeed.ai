// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import type { IBrandSubscriberImportSummary } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import publishing from '../../../../messages/en/pages/publishing.json';
import NewsletterImportSummary from './NewsletterImportSummary';

vi.unmock('next-intl');

function buildSummary(
  overrides: Partial<IBrandSubscriberImportSummary>,
): IBrandSubscriberImportSummary {
  return {
    added: 1,
    duplicate: 1,
    importId: null,
    invalid: 0,
    invalidRows: [],
    isPreview: true,
    pendingConfirmation: 1,
    previewRows: [],
    suppressed: 1,
    totalRows: 3,
    ...overrides,
  };
}

function renderSummary(summary: IBrandSubscriberImportSummary) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ pages: { publishing } }}
      onError={() => undefined}
    >
      <NewsletterImportSummary summary={summary} />
    </NextIntlClientProvider>,
  );
}

describe('NewsletterImportSummary', () => {
  it('lists the invalid rows by number next to the aggregate counts', () => {
    renderSummary(
      buildSummary({
        invalid: 2,
        invalidRows: [
          { row: 3, value: 'not-an-email' },
          { row: 7, value: '' },
        ],
      }),
    );

    expect(screen.getByText('Not an email address')).toBeInTheDocument();
    expect(screen.getByText('Rows to fix')).toBeInTheDocument();
    expect(screen.getByText('Row 3: not-an-email')).toBeInTheDocument();
    expect(screen.getByText('Row 7: empty value')).toBeInTheDocument();
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it('shows markup in a row value as plain text', () => {
    const { container } = renderSummary(
      buildSummary({
        invalid: 1,
        invalidRows: [{ row: 2, value: '<img src=x onerror=alert(1)>' }],
      }),
    );

    expect(
      screen.getByText('Row 2: <img src=x onerror=alert(1)>'),
    ).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('says when only the first invalid rows are listed', () => {
    renderSummary(
      buildSummary({
        invalid: 40,
        invalidRows: [
          { row: 2, value: 'a' },
          { row: 5, value: 'b' },
        ],
      }),
    );

    expect(
      screen.getByText(
        'Showing the first 2 of 40 rows that are not an email address.',
      ),
    ).toBeInTheDocument();
  });

  it('renders no invalid-row list when every row is valid', () => {
    renderSummary(buildSummary({ invalid: 0, invalidRows: [] }));

    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.queryByText('Rows to fix')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
