import '@testing-library/jest-dom/vitest';
import type { BrandedGenerationFeedbackReadV1 } from '@genfeedai/contracts/api-types/contracts/branded-generation-feedback.contract';
import type { GenerationFeedbackState } from '@genfeedai/props/content/branded-generation-receipt.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationFeedback from './GenerationFeedback';

const mocks = vi.hoisted(() => ({
  state: null as unknown as GenerationFeedbackState,
}));
vi.mock('@hooks/ui/generation-receipts/use-generation-feedback', () => ({
  useGenerationFeedback: () => mocks.state,
}));
vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  return {
    useTranslations: createTranslateFromCatalog({
      ui: {
        generationFeedback: {
          failed: 'Could not save',
          prompt: 'Was this on brand?',
          reasonOffVoice: 'Off voice',
          reasonOther: 'Something else',
          reasonTooGeneric: 'Too generic',
          reasonTooLong: 'Too long',
          reasonWrongFacts: 'Wrong facts',
          reasonsLabel: 'What was wrong',
          reasonsPrompt: 'What was off?',
          saved: 'Thanks, saved.',
          thumbsDown: 'Not good',
          thumbsUp: 'Good',
        },
      },
    }),
  };
});

function feedback(
  overrides: Partial<BrandedGenerationFeedbackReadV1> = {},
): BrandedGenerationFeedbackReadV1 {
  return {
    id: 'receipt',
    implicit: {
      isDiscarded: false,
      isEdited: null,
      postStatus: null,
      reviewDecision: null,
    },
    ratedAt: null,
    rating: null,
    reasons: [],
    receiptId: 'receipt',
    ...overrides,
  };
}
function state(
  overrides: Partial<GenerationFeedbackState> = {},
): GenerationFeedbackState {
  return {
    feedback: feedback(),
    hasError: false,
    isSaving: false,
    rate: vi.fn(),
    toggleReason: vi.fn(),
    ...overrides,
  };
}

describe('GenerationFeedback', () => {
  beforeEach(() => {
    mocks.state = state();
  });

  it('rates with the thumbs and shows no reasons before a thumbs down', () => {
    render(<GenerationFeedback brandId="brand" receiptId="receipt" />);
    fireEvent.click(screen.getByRole('button', { name: 'Good' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not good' }));
    expect(mocks.state.rate).toHaveBeenNthCalledWith(1, 'up');
    expect(mocks.state.rate).toHaveBeenNthCalledWith(2, 'down');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('marks the chosen thumb and confirms the save', () => {
    mocks.state = state({ feedback: feedback({ rating: 'up' }) });
    render(<GenerationFeedback brandId="brand" receiptId="receipt" />);
    expect(screen.getByRole('button', { name: 'Good' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Not good' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Thanks, saved.');
  });

  it('offers the reason chips after a thumbs down and toggles them', () => {
    mocks.state = state({
      feedback: feedback({ rating: 'down', reasons: ['off_voice'] }),
    });
    render(<GenerationFeedback brandId="brand" receiptId="receipt" />);
    const group = screen.getByRole('group', { name: 'What was wrong' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Off voice' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Too long' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Too long' }));
    expect(mocks.state.toggleReason).toHaveBeenCalledWith('too_long');
  });

  it('disables the controls until the rating loads and while saving', () => {
    mocks.state = state({ feedback: null });
    const view = render(
      <GenerationFeedback brandId="brand" receiptId="receipt" />,
    );
    expect(screen.getByRole('button', { name: 'Good' })).toBeDisabled();
    view.unmount();
    mocks.state = state({ isSaving: true });
    render(<GenerationFeedback brandId="brand" receiptId="receipt" />);
    expect(screen.getByRole('button', { name: 'Not good' })).toBeDisabled();
  });

  it('tells the member when saving failed', () => {
    mocks.state = state({ hasError: true });
    render(<GenerationFeedback brandId="brand" receiptId="receipt" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
  });
});
