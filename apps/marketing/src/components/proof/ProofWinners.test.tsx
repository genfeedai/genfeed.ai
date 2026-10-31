import { getPublishedWinners } from '@data/winners.data';
import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProofWinners from './ProofWinners';

vi.mock('@data/winners.data', () => ({
  getPublishedWinners: vi.fn(() => []),
}));

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    <span
      aria-label={props.alt ?? ''}
      data-src={typeof props.src === 'string' ? props.src : undefined}
      role="img"
    />
  ),
}));

const mockedPublishedWinners = vi.mocked(getPublishedWinners);

const LINKEDIN_WINNER = {
  canonicalUrl: 'https://www.linkedin.com/posts/example-7496948106077323264',
  id: 'linkedin-2026-08-23',
  linkLabel: 'View on LinkedIn',
  mediaType: 'Post copy + generated frame',
  metricLabel: 'Impressions, read 1 Sep 2026',
  metricValue: '33,793',
  platform: 'LinkedIn',
  previewAlt: 'Generated outbid.lol frame',
  previewSrc: 'https://cdn.genfeed.ai/linkedin-proof.jpg',
  provenance: 'Copy and frame generated in Genfeed.',
  publishedAt: '2026-08-23',
  socialProof: {
    authorHandle: 'vincentshipsit',
    authorHeadline: 'Agentic Founder',
    authorName: 'Vincent Tellier',
    captionExcerpt: 'The published post excerpt.',
    comments: '40 comments',
    reactions: '61 reactions',
    reposts: '1 repost',
  },
  title: 'Copy and frame, made in one pass',
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

    expect(
      screen.getByRole('heading', { level: 2, name: 'Your next post.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('33,793')).toBeInTheDocument();
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

  it('renders the published LinkedIn post with its source details', () => {
    mockedPublishedWinners.mockReturnValue([LINKEDIN_WINNER]);

    render(<ProofWinners />);

    expect(
      screen.getByRole('article', {
        name: /published linkedin post by vincent tellier/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('The published post excerpt.')).toBeInTheDocument();
    expect(screen.getByText('61 reactions')).toBeInTheDocument();
    expect(screen.getByText(/40 comments/i)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'data-src',
      LINKEDIN_WINNER.previewSrc,
    );
  });
});
