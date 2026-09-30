import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Question } from '../types';
import { QuestionCard } from './QuestionCard';

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q-1',
    text: 'Which platform should we target first?',
    type: 'free_text',
    ...overrides,
  };
}

describe('QuestionCard', () => {
  it('renders the question text', () => {
    render(<QuestionCard question={makeQuestion()} onAnswer={vi.fn()} />);

    expect(
      screen.getByText('Which platform should we target first?'),
    ).toBeInTheDocument();
  });

  it('keeps the submit action disabled until free text is entered', () => {
    render(<QuestionCard question={makeQuestion()} onAnswer={vi.fn()} />);

    const submit = screen.getByRole('button', { name: /Submit answer/ });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: 'Instagram' },
    });

    expect(submit).toBeEnabled();
  });

  it('submits the free text answer', () => {
    const onAnswer = vi.fn();
    render(<QuestionCard question={makeQuestion()} onAnswer={onAnswer} />);

    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: 'Instagram' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit answer/ }));

    expect(onAnswer).toHaveBeenCalledWith('q-1', 'Instagram');
  });

  it('treats whitespace-only free text as unanswered', () => {
    render(<QuestionCard question={makeQuestion()} onAnswer={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: '   ' },
    });

    expect(
      screen.getByRole('button', { name: /Submit answer/ }),
    ).toBeDisabled();
  });

  it('submits the picked option for a multiple choice question', () => {
    const onAnswer = vi.fn();
    render(
      <QuestionCard
        question={makeQuestion({
          options: ['Instagram', 'TikTok'],
          type: 'multiple_choice',
        })}
        onAnswer={onAnswer}
      />,
    );

    const submit = screen.getByRole('button', { name: /Submit answer/ });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /TikTok/ }));
    fireEvent.click(submit);

    expect(onAnswer).toHaveBeenCalledWith('q-1', 'TikTok');
  });

  it('shows the recorded answer and hides submit once answered', () => {
    render(
      <QuestionCard
        question={makeQuestion({ answer: 'Instagram' })}
        onAnswer={vi.fn()}
      />,
    );

    expect(screen.getByText('Answered: Instagram')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Submit answer/ }),
    ).not.toBeInTheDocument();
  });

  it('disables input while the card is disabled', () => {
    render(
      <QuestionCard question={makeQuestion()} onAnswer={vi.fn()} disabled />,
    );

    expect(screen.getByPlaceholderText('Type your answer...')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Submit answer/ }),
    ).toBeDisabled();
  });
});
