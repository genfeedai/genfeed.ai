'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IBrandInterviewQuestion } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import { useBrandInterview } from '@hooks/utils/use-brand-interview/use-brand-interview';
import { BrandInterviewService } from '@services/social/brand-interview.service';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useEffect, useState } from 'react';

const INTERVIEW_CREDIT_COST = 10;

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: IBrandInterviewQuestion;
  value: string;
  onChange: (val: string) => void;
}) {
  if (question.answerType === 'enum' && question.enumOptions?.length) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="interview-answer-enum">
          <SelectValue placeholder="Select an option…" />
        </SelectTrigger>
        <SelectContent>
          {question.enumOptions.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (question.answerType === 'list') {
    return (
      <div className="flex flex-col gap-1.5">
        <Textarea
          id="interview-answer-list"
          placeholder="Enter values separated by commas or new lines…"
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">
          Separate multiple values with commas or new lines.
        </p>
      </div>
    );
  }

  return (
    <Input
      id="interview-answer-text"
      placeholder="Type your answer…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function BrandSettingsInterviewPage() {
  const { brand, brandId, hasBrandId, isLoading, handleRefreshBrand } =
    useBrandDetail();

  const {
    status,
    currentQuestion,
    progress,
    completenessScore,
    isLoading: isInterviewLoading,
    error,
    startInterview,
    submitAnswer,
    skipQuestion,
  } = useBrandInterview(brandId || null);

  const getInterviewService = useAuthedService((token: string) =>
    BrandInterviewService.getInstance(token),
  );

  const [idleScore, setIdleScore] = useState<number | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');

  // Fetch completeness on idle mount
  useEffect(() => {
    if (!brandId || status !== 'idle') {
      return;
    }

    const controller = new AbortController();

    const fetchCompleteness = async () => {
      try {
        const service = await getInterviewService();
        const result = await service.getCompleteness(
          brandId,
          controller.signal,
        );

        if (!controller.signal.aborted) {
          setIdleScore(result.overallScore);
        }
      } catch (err: unknown) {
        const e = err as Error;

        if (e?.name !== 'AbortError') {
          // Silently fail — score is decorative on the idle screen
        }
      }
    };

    fetchCompleteness();

    return () => {
      controller.abort();
    };
  }, [brandId, status, getInterviewService]);

  // Refresh brand data when interview completes so completeness card updates
  const handleInterviewComplete = useCallback(() => {
    handleRefreshBrand(true);
  }, [handleRefreshBrand]);

  useEffect(() => {
    if (status === 'complete') {
      handleInterviewComplete();
    }
  }, [status, handleInterviewComplete]);

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Brand not found.</p>
      </Card>
    );
  }

  // Idle state — show completeness + credit disclosure + start button
  if (status === 'idle') {
    return (
      <Card className="p-6">
        <div className="flex flex-col gap-4 max-w-lg">
          <div>
            <h2 className="text-base font-semibold">Brand Context Interview</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Answer a set of targeted questions to help Genfeed understand your
              brand&apos;s identity, voice, and strategy. Better context means
              better AI content.
            </p>
          </div>

          {idleScore !== null && (
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${idleScore}%` }}
                />
              </div>
              <span className="text-sm font-medium text-muted-foreground w-10 text-right">
                {idleScore}%
              </span>
            </div>
          )}

          <div className="rounded-md bg-secondary px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Starting a new interview uses{' '}
              <strong>{INTERVIEW_CREDIT_COST} credits</strong>. Resuming an
              existing session is free.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div>
            <Button
              isDisabled={isInterviewLoading}
              variant={ButtonVariant.DEFAULT}
              onClick={startInterview}
            >
              {isInterviewLoading ? 'Starting…' : 'Start interview'}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // Complete state
  if (status === 'complete') {
    return (
      <Card className="p-6">
        <div className="flex flex-col gap-4 max-w-lg">
          <div>
            <h2 className="text-base font-semibold text-green-400">
              Interview complete
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your brand context has been updated. Overall completeness is now{' '}
              <strong>{completenessScore}%</strong>. The AI will use this
              context when generating content.
            </p>
          </div>

          <div>
            <Button
              variant={ButtonVariant.DEFAULT}
              onClick={() => {
                window.location.reload();
              }}
            >
              Start another interview
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // In progress state
  return (
    <Card className="p-6">
      <div className="flex flex-col gap-5 max-w-lg">
        {/* Progress indicator */}
        {progress && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Progress</span>
              <span className="text-xs font-medium text-muted-foreground">
                {progress.answeredFields} / {progress.totalFields} fields (
                {progress.percentComplete}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${progress.percentComplete}%` }}
              />
            </div>
          </div>
        )}

        {/* Current question */}
        {currentQuestion ? (
          <div className="flex flex-col gap-3">
            <div>
              <label
                className="text-sm font-medium leading-snug"
                htmlFor={
                  currentQuestion.answerType === 'enum'
                    ? 'interview-answer-enum'
                    : currentQuestion.answerType === 'list'
                      ? 'interview-answer-list'
                      : 'interview-answer-text'
                }
              >
                {currentQuestion.questionText}
                {currentQuestion.isRequired && (
                  <span className="ml-1 text-destructive">*</span>
                )}
              </label>

              {currentQuestion.hint && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {currentQuestion.hint}
                </p>
              )}
            </div>

            <QuestionInput
              question={currentQuestion}
              value={answerDraft}
              onChange={setAnswerDraft}
            />

            {currentQuestion.examples &&
              currentQuestion.examples.length > 0 && (
                <div className="rounded-md bg-white/[0.03] px-3 py-2">
                  <p className="text-[11px] text-muted-foreground font-medium mb-1">
                    Examples
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {currentQuestion.examples.map((ex) => (
                      <li
                        key={ex}
                        className="text-[11px] text-muted-foreground/70"
                      >
                        {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                isDisabled={isInterviewLoading || !answerDraft.trim()}
                variant={ButtonVariant.DEFAULT}
                onClick={() => {
                  submitAnswer(answerDraft.trim());
                  setAnswerDraft('');
                }}
              >
                {isInterviewLoading ? 'Submitting…' : 'Submit'}
              </Button>

              <Button
                isDisabled={isInterviewLoading}
                variant={ButtonVariant.GHOST}
                onClick={() => {
                  skipQuestion();
                  setAnswerDraft('');
                }}
              >
                Skip
              </Button>
            </div>
          </div>
        ) : (
          <Loading isFullSize={false} />
        )}
      </div>
    </Card>
  );
}
