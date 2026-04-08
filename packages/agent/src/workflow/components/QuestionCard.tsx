import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { CircleHelp, Send } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import type { Question } from '../types';

interface QuestionCardProps {
  question: Question;
  onAnswer: (questionId: string, answer: string) => void;
  disabled?: boolean;
}

function QuestionCardInner({
  question,
  onAnswer,
  disabled,
}: QuestionCardProps) {
  const [selectedOption, setSelectedOption] = useState<string>(
    question.answer ?? '',
  );
  const [freeText, setFreeText] = useState(question.answer ?? '');
  const isAnswered = question.answer !== undefined && question.answer !== '';

  const handleSubmit = useCallback(() => {
    const answer =
      question.type === 'multiple_choice' ? selectedOption : freeText;
    if (answer) {
      onAnswer(question.id, answer);
    }
  }, [question, selectedOption, freeText, onAnswer]);

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all',
        isAnswered
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : 'border-white/10 bg-white/5',
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <CircleHelp
          className={cn(
            'size-5 shrink-0 mt-0.5',
            isAnswered ? 'text-emerald-400' : 'text-blue-400',
          )}
        />
        <p className="text-sm text-white/90 font-medium">{question.text}</p>
      </div>

      {question.type === 'multiple_choice' && question.options ? (
        <div className="space-y-2 ml-8">
          {question.options.map((option) => (
            <label
              key={option}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all',
                selectedOption === option
                  ? 'bg-blue-500/15 text-white ring-1 ring-blue-500/30'
                  : 'bg-white/5 text-white/70 hover:bg-white/10',
                (disabled || isAnswered) && 'pointer-events-none opacity-60',
              )}
            >
              <input
                type="radio"
                name={`q-${question.id}`}
                value={option}
                checked={selectedOption === option}
                onChange={() => setSelectedOption(option)}
                disabled={disabled || isAnswered}
                className="sr-only"
              />
              <span
                className={cn(
                  'size-4 rounded-full border-2 flex items-center justify-center shrink-0',
                  selectedOption === option
                    ? 'border-blue-400'
                    : 'border-white/30',
                )}
              >
                {selectedOption === option && (
                  <span className="size-2 rounded-full bg-blue-400" />
                )}
              </span>
              {option}
            </label>
          ))}
        </div>
      ) : (
        <div className="ml-8">
          <Textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            disabled={disabled || isAnswered}
            placeholder="Type your answer..."
            rows={3}
            className={cn(
              'bg-white/5 border-white/10 text-white/90 placeholder:text-white/30 resize-none',
              (disabled || isAnswered) && 'opacity-60',
            )}
          />
        </div>
      )}

      {!isAnswered && (
        <div className="mt-3 ml-8">
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={handleSubmit}
            isDisabled={
              disabled ||
              (question.type === 'multiple_choice'
                ? !selectedOption
                : !freeText.trim())
            }
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="size-3.5" />
            Submit answer
          </Button>
        </div>
      )}

      {isAnswered && (
        <div className="mt-2 ml-8">
          <p className="text-xs text-emerald-400/70">
            Answered: {question.answer}
          </p>
        </div>
      )}
    </div>
  );
}

export const QuestionCard = memo(QuestionCardInner);
