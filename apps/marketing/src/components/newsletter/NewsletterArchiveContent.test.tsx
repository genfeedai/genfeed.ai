import type { IPublicNewsletterArchive } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import NewsletterArchiveContent from '@web-components/newsletter/NewsletterArchiveContent';
import { describe, expect, it } from 'vitest';

const ARCHIVE: IPublicNewsletterArchive = {
  brand: { id: 'brand-1', label: 'Genfeed', slug: 'genfeedai' },
  hasMore: true,
  issues: [
    {
      accessLevel: 'public',
      id: 'issue-2',
      publishedAt: '2026-11-02T09:00:00.000Z',
      readingMinutes: 4,
      subject: 'What shipped in 0.2.28',
      summary: 'Newsletters, clips and a faster editor.',
    },
    {
      accessLevel: 'paid',
      id: 'issue-1',
      publishedAt: '2026-10-26T09:00:00.000Z',
      readingMinutes: 6,
      subject: 'Our posting playbook',
      summary: null,
    },
  ],
};

describe('NewsletterArchiveContent', () => {
  it('lists every issue with its date, reading time and page link', () => {
    render(<NewsletterArchiveContent archive={ARCHIVE} page={1} />);

    expect(
      screen.getByRole('link', { name: 'What shipped in 0.2.28' }),
    ).toHaveAttribute('href', '/newsletter/issue-2');
    expect(screen.getByText('November 2, 2026')).toBeInTheDocument();
    expect(screen.getByText('4 min read')).toBeInTheDocument();
    expect(screen.getByText('Paid subscribers')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Older issues' })).toHaveAttribute(
      'href',
      '/newsletter?page=2',
    );
    expect(
      screen.getByRole('textbox', { name: 'Email address' }),
    ).toBeInTheDocument();
  });

  it('invites a sign-up before the first issue is out', () => {
    render(
      <NewsletterArchiveContent
        archive={{ ...ARCHIVE, hasMore: false, issues: [] }}
        page={1}
      />,
    );

    expect(
      screen.getByText('The first issue is on its way. Subscribe to get it.'),
    ).toBeInTheDocument();
  });

  it('says the archive is unavailable instead of failing the page', () => {
    render(<NewsletterArchiveContent archive={null} page={1} />);

    expect(
      screen.getByText(
        'The archive is temporarily unavailable. Check back in a few minutes.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Email address' }),
    ).not.toBeInTheDocument();
  });
});
