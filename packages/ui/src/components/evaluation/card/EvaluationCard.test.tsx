import type { IEvaluation, IEvaluationData } from '@genfeedai/client/models';
import {
  EvaluationSeverity,
  IngredientCategory,
  Status,
} from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

import EvaluationCard from '@ui/evaluation/card/EvaluationCard';

function buildEvaluation(
  dataOverrides: Partial<IEvaluationData> = {},
): IEvaluation {
  return {
    contentId: 'video-1',
    contentType: IngredientCategory.VIDEO,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    data: {
      analysis: {
        aiModel: 'test-model',
        strengths: [],
        suggestions: [],
        weaknesses: [],
      },
      flags: {
        isFlagged: false,
        reasons: [],
        severity: EvaluationSeverity.INFO,
      },
      overallScore: 82,
      scores: {
        brand: { overall: 78 },
        engagement: { overall: 85 },
        persuasion: {
          ctaNaturalness: 76,
          demandFit: 70,
          hookStrength: 90,
          openLoopIntegrity: 60,
          overall: 74,
        },
        technical: { overall: 80 },
      },
      status: Status.COMPLETED,
      ...dataOverrides,
    },
    id: 'evaluation-1',
    isDeleted: false,
    organizationId: 'org-1',
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'user-1',
  };
}

describe('EvaluationCard', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <EvaluationCard
        contentId="video-1"
        contentType={IngredientCategory.VIDEO}
        onEvaluate={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders a persuasion score section when the evaluation has persuasion scores', () => {
    render(
      <EvaluationCard
        contentId="video-1"
        contentType={IngredientCategory.VIDEO}
        evaluation={buildEvaluation()}
        onEvaluate={vi.fn()}
      />,
    );

    expect(screen.getByText('Persuasion')).toBeInTheDocument();
    expect(screen.getByText('Hook Strength')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });

  it('omits the persuasion section when the evaluation has no persuasion scores', () => {
    render(
      <EvaluationCard
        contentId="video-1"
        contentType={IngredientCategory.VIDEO}
        evaluation={buildEvaluation({
          scores: {
            brand: { overall: 78 },
            engagement: { overall: 85 },
            technical: { overall: 80 },
          },
        })}
        onEvaluate={vi.fn()}
      />,
    );

    expect(screen.queryByText('Persuasion')).not.toBeInTheDocument();
  });

  describe('embedded variant', () => {
    it('renders one compact row without a card and offers Run when not run', () => {
      const onEvaluate = vi.fn();
      render(
        <EvaluationCard
          contentId="post-1"
          contentType="post"
          onEvaluate={onEvaluate}
          variant="embedded"
        />,
      );

      expect(screen.getByText('Quality evaluation')).toBeInTheDocument();
      expect(screen.getByText('Not run')).toBeInTheDocument();
      expect(
        screen.queryByText('Get AI-powered quality analysis for this post'),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Run evaluation' }));

      expect(onEvaluate).toHaveBeenCalledTimes(1);
    });

    it('shows the score, offers Re-run, and expands details on demand', () => {
      render(
        <EvaluationCard
          contentId="post-1"
          contentType="post"
          evaluation={buildEvaluation()}
          onEvaluate={vi.fn()}
          variant="embedded"
        />,
      );

      expect(screen.getByText('82/100')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Re-run evaluation' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Persuasion')).not.toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: 'Toggle evaluation details' }),
      );

      expect(screen.getByText('Persuasion')).toBeInTheDocument();
    });

    it('hides the run action for published posts', () => {
      render(
        <EvaluationCard
          contentId="post-1"
          contentType="post"
          evaluation={buildEvaluation()}
          isPublished
          onEvaluate={vi.fn()}
          variant="embedded"
        />,
      );

      expect(screen.getByText('82/100')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /run evaluation/i }),
      ).not.toBeInTheDocument();
    });
  });
});
