import type { IEvaluation, IEvaluationData } from '@genfeedai/client/models';
import {
  EvaluationSeverity,
  IngredientCategory,
  Status,
} from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
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
});
