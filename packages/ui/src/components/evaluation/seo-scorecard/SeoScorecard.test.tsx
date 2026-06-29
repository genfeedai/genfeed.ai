import type { SeoScorecardSnapshot } from '@genfeedai/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import SeoScorecard from '@ui/evaluation/seo-scorecard/SeoScorecard';
import { describe, expect, it, vi } from 'vitest';

const scorecard: SeoScorecardSnapshot = {
  breakdown: {
    contentStructure: 16,
    keywordPlacement: 18,
    links: 4,
    media: 6,
    metaOptimization: 12,
    readability: 13,
    technicalSignals: 8,
  },
  checks: [
    {
      available: true,
      dimension: 'metaOptimization',
      id: 'title_length',
      kind: 'deterministic',
      label: 'Title length',
      max: 3,
      note: 'Title length is within range.',
      points: 3,
    },
    {
      available: true,
      dimension: 'links',
      id: 'internal_links',
      kind: 'deterministic',
      label: 'Internal links',
      max: 3,
      note: 'Add internal links.',
      points: 1,
    },
  ],
  meta: {
    fleschReadingEase: 58,
    keywordDensity: 1.4,
    llmApplied: true,
    maxAvailable: 100,
    scoredAt: '2026-06-28T12:00:00.000Z',
    targetKeyword: 'workflow automation',
    wordCount: 842,
  },
  rating: 'good',
  score: 77,
  suggestions: ['Add more internal links.', 'Tighten the meta description.'],
};

describe('SeoScorecard', () => {
  it('renders score, breakdown, checks, and suggestions', () => {
    render(<SeoScorecard score={77} scorecard={scorecard} />);

    expect(screen.getByText('77')).toBeInTheDocument();
    expect(screen.getByText('/100')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('workflow automation')).toBeInTheDocument();
    expect(screen.getByText('Keyword')).toBeInTheDocument();
    expect(screen.getByText('18/20')).toBeInTheDocument();
    expect(screen.getByText('Title length')).toBeInTheDocument();
    expect(screen.getByText('Internal links')).toBeInTheDocument();
    expect(screen.getByText('Add more internal links.')).toBeInTheDocument();
  });

  it('renders an empty state and calls onScore', () => {
    const onScore = vi.fn();
    render(<SeoScorecard contentTypeLabel="article" onScore={onScore} />);

    expect(screen.getByText('No SEO score yet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Score SEO' }));

    expect(onScore).toHaveBeenCalledTimes(1);
  });

  it('disables scoring when the content has unsaved changes', () => {
    const onScore = vi.fn();
    render(<SeoScorecard hasUnsavedChanges={true} onScore={onScore} />);

    expect(screen.getByRole('button', { name: 'Score SEO' })).toBeDisabled();
    expect(
      screen.getByText('Save your changes before scoring.'),
    ).toBeInTheDocument();
  });
});
