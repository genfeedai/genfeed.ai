import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { CircleQuestionMark, Send } from 'lucide-react';
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
    <Card
      bodyClassName="gap-0 p-4"
      className={cn(isAnswered && 'bg-success/10')}
    >
      <div className="flex items-start gap-3 mb-3">
        <CircleQuestionMark
          className={cn(
            'size-5 shrink-0 mt-0.5',
            isAnswered ? 'text-success' : 'text-info',
          )}
        />
        <p className="text-sm text-foreground/90 font-medium">
          {question.text}
        </p>
      </div>

      {question.type === 'multiple_choice' && question.options ? (
        <div className="space-y-2 ml-8">
          {question.options.map((option) => (
            <label
              key={option}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all',
                selectedOption === option
                  ? 'bg-info/15 text-info ring-1 ring-info/30'
                  : 'bg-foreground/5 text-foreground/70 hover:bg-foreground/10',
                (disabled || isAnswered) && 'pointer-events-none opacity-60',
              )}
            >
              <Input
                type="radio"
                name={`q-${question.id}`}
                value={option}
                isChecked={selectedOption === option}
                onChange={() => setSelectedOption(option)}
                isDisabled={disabled || isAnswered}
                className="sr-only"
              />
              <span
                className={cn(
                  'size-4 rounded-full border-2 flex items-center justify-center shrink-0',
                  selectedOption === option
                    ? 'border-info/20'
                    : 'border-foreground/30',
                )}
              >
                {selectedOption === option && (
                  <span className="size-2 rounded-full bg-info" />
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
              'bg-foreground/5 border-foreground/10 text-foreground/90 placeholder:text-foreground/30 resize-none',
              (disabled || isAnswered) && 'opacity-60',
            )}
          />
        </div>
      )}

      {!isAnswered && (
        <div className="mt-3 ml-8">
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            withWrapper={false}
            onClick={handleSubmit}
            isDisabled={
              disabled ||
              (question.type === 'multiple_choice'
                ? !selectedOption
                : !freeText.trim())
            }
            className="inline-flex items-center gap-2"
          >
            <Send className="size-3.5" />
            Submit answer
          </Button>
        </div>
      )}

      {isAnswered && (
        <div className="mt-2 ml-8">
          <p className="text-xs text-success/70">Answered: {question.answer}</p>
        </div>
      )}
    </Card>
  );
}

export const QuestionCard = memo(QuestionCardInner);
