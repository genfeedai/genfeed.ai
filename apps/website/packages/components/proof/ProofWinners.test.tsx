import { getPublishedWinners } from '@data/winners.data';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProofWinners from './ProofWinners';

vi.mock('@data/winners.data', () => ({
  getPublishedWinners: vi.fn(() => []),
}));

const mockedPublishedWinners = vi.mocked(getPublishedWinners);

const LINKEDIN_WINNER = {
  canonicalUrl: 'https://www.linkedin.com/posts/example-7496948106077323264',
  id: 'linkedin-2026-08-23',
  linkLabel: 'View on LinkedIn',
  mediaType: 'Post copy + generated frame',
  metricLabel: 'Impressions, read 29 Aug 2026',
  metricValue: '30,000',
  platform: 'LinkedIn',
  provenance: 'Copy and frame generated in Genfeed.',
  publishedAt: '2026-08-23',
  title: 'An organic LinkedIn post, written and framed in one pass',
};

describe('ProofWinners', () => {
  beforeEach(() => {
    mockedPublishedWinners.mockReset();
  });

  it('renders nothing until a piece is published with a verified metric', () => {
    mockedPublishedWinners.mockReturnValue([]);

    const { container } = render(<ProofWinners />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the metric, the provenance, and a link to the live piece', () => {
    mockedPublishedWinners.mockReturnValue([LINKEDIN_WINNER]);

    render(<ProofWinners />);

    expect(screen.getByText('30,000')).toBeInTheDocument();
    expect(screen.getByText(LINKEDIN_WINNER.metricLabel)).toBeInTheDocument();
    expect(screen.getByText(LINKEDIN_WINNER.title)).toBeInTheDocument();
    expect(
      screen.getByText(/copy and frame generated in genfeed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view on linkedin/i }),
    ).toHaveAttribute('href', LINKEDIN_WINNER.canonicalUrl);
  });

  it('dates the piece from its machine-readable publication date', () => {
    mockedPublishedWinners.mockReturnValue([LINKEDIN_WINNER]);

    const { container } = render(<ProofWinners />);
    const publishedAt = container.querySelector('time');

    expect(publishedAt).toHaveAttribute('datetime', '2026-08-23');
    expect(publishedAt).toHaveTextContent('Aug 23, 2026');
  });

  it('omits the preview frame until a real asset exists', () => {
    mockedPublishedWinners.mockReturnValue([LINKEDIN_WINNER]);

    render(<ProofWinners />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
