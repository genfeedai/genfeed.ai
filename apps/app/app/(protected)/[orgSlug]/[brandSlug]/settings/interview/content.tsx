'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IBrandInterviewQuestion } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import { useBrandInterview } from '@hooks/utils/use-brand-interview/use-brand-interview';
import { BrandInterviewService } from '@services/social/brand-interview.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
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
import { Sparkles } from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useBrandInterviewDraftStore } from '@/store/brand-interview-draft.store';

const INTERVIEW_CREDIT_COST = 10;

function parseListDraft(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function serializeListDraft(items: string[]): string {
  return items.join('\n');
}

function ProgressBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function InlineListAnswer({
  value,
  onChange,
  examples,
  isDisabled,
  onSubmit,
}: {
  value: string;
  onChange: (next: string) => void;
  examples?: string[];
  isDisabled?: boolean;
  onSubmit: () => void;
}) {
  const chips = useMemo(() => parseListDraft(value), [value]);
  const [chipDraft, setChipDraft] = useState('');

  const commitChip = useCallback(
    (raw: string) => {
      const next = raw.trim();
      if (!next) {
        return;
      }
      if (chips.some((chip) => chip.toLowerCase() === next.toLowerCase())) {
        setChipDraft('');
        return;
      }
      onChange(serializeListDraft([...chips, next]));
      setChipDraft('');
    },
    [chips, onChange],
  );

  const removeChip = useCallback(
    (chip: string) => {
      onChange(serializeListDraft(chips.filter((item) => item !== chip)));
    },
    [chips, onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Button
              key={chip}
              type="button"
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              isDisabled={isDisabled}
              onClick={() => removeChip(chip)}
              className="h-7 max-w-full gap-1 rounded-full px-2.5 text-xs"
              ariaLabel={`Remove ${chip}`}
            >
              <span className="truncate">{chip}</span>
              <span className="text-muted-foreground" aria-hidden>
                ×
              </span>
            </Button>
          ))}
        </div>
      ) : null}

      <Input
        aria-label="Interview list answer"
        placeholder="Type a pillar, press Enter to add…"
        value={chipDraft}
        disabled={isDisabled}
        onChange={(event) => setChipDraft(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitChip(chipDraft);
          }
        }}
      />

      {examples && examples.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {examples.map((example) => {
            const isSelected = chips.some(
              (chip) => chip.toLowerCase() === example.toLowerCase(),
            );
            return (
              <Button
                key={example}
                type="button"
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                isDisabled={isDisabled || isSelected}
                className="h-7 max-w-full truncate px-2 text-[11px]"
                onClick={() => commitChip(example)}
              >
                {example}
              </Button>
            );
          })}
        </div>
      ) : null}

      {chips.length > 0 ? (
        <Button
          type="button"
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          className="h-7 self-start px-1 text-xs text-muted-foreground"
          isDisabled={isDisabled}
          onClick={onSubmit}
        >
          Continue with {chips.length} item{chips.length === 1 ? '' : 's'} →
        </Button>
      ) : null}
    </div>
  );
}

function InlineAnswer({
  question,
  value,
  onChange,
  isDisabled,
  onSubmit,
}: {
  question: IBrandInterviewQuestion;
  value: string;
  onChange: (val: string) => void;
  isDisabled?: boolean;
  onSubmit: () => void;
}) {
  if (question.answerType === 'enum' && question.enumOptions?.length) {
    return (
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={isDisabled}
      >
        <SelectTrigger
          id="interview-answer-enum"
          aria-label="Interview answer"
          className="w-full"
        >
          <SelectValue placeholder="Choose one…" />
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
      <InlineListAnswer
        value={value}
        onChange={onChange}
        examples={question.examples}
        isDisabled={isDisabled}
        onSubmit={onSubmit}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        id="interview-answer-text"
        aria-label="Interview answer"
        placeholder="Type your answer…"
        value={value}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter' && value.trim()) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      {question.examples && question.examples.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {question.examples.map((example) => (
            <Button
              key={example}
              type="button"
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              isDisabled={isDisabled}
              className="h-7 max-w-full truncate px-2 text-[11px]"
              onClick={() => onChange(example)}
            >
              {example}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Brand interview — one question at a time, inline controls, drafts in Zustand
 * (localStorage) so a refresh does not wipe the answer mid-type.
 */
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

  const fieldKey = currentQuestion?.fieldKey;
  const answerValue = useBrandInterviewDraftStore((state) =>
    brandId && fieldKey ? state.getAnswer(brandId, fieldKey) : '',
  );
  const setDraftAnswer = useBrandInterviewDraftStore(
    (state) => state.setAnswer,
  );
  const clearDraftAnswer = useBrandInterviewDraftStore(
    (state) => state.clearAnswer,
  );
  const clearBrandDrafts = useBrandInterviewDraftStore(
    (state) => state.clearBrand,
  );

  const [idleScore, setIdleScore] = useState<number | null>(null);

  const setAnswerValue = useCallback(
    (value: string) => {
      if (!brandId || !fieldKey) {
        return;
      }
      setDraftAnswer(brandId, fieldKey, value);
    },
    [brandId, fieldKey, setDraftAnswer],
  );

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
          // decorative score only
        }
      }
    };

    void fetchCompleteness();

    return () => {
      controller.abort();
    };
  }, [brandId, status, getInterviewService]);

  const handleInterviewComplete = useCallback(() => {
    if (brandId) {
      clearBrandDrafts(brandId);
    }
    void handleRefreshBrand(true);
  }, [brandId, clearBrandDrafts, handleRefreshBrand]);

  useEffect(() => {
    if (status === 'complete') {
      handleInterviewComplete();
    }
  }, [status, handleInterviewComplete]);

  const handleSubmit = useCallback(async () => {
    if (!brandId || !currentQuestion) {
      return;
    }
    const trimmed = answerValue.trim();
    if (!trimmed) {
      return;
    }
    await submitAnswer(trimmed);
    clearDraftAnswer(brandId, currentQuestion.fieldKey);
  }, [answerValue, brandId, clearDraftAnswer, currentQuestion, submitAnswer]);

  const handleSkip = useCallback(async () => {
    if (!brandId || !currentQuestion) {
      return;
    }
    await skipQuestion();
    clearDraftAnswer(brandId, currentQuestion.fieldKey);
  }, [brandId, clearDraftAnswer, currentQuestion, skipQuestion]);

  const handleFormSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void handleSubmit();
    },
    [handleSubmit],
  );

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Container>
        <Card>
          <p className="text-sm text-muted-foreground">Brand not found.</p>
        </Card>
      </Container>
    );
  }

  if (status === 'idle') {
    return (
      <Container>
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          <Card
            label="Interview"
            description="A few short questions. Answers land on brand voice and strategy so agents write like you."
            headerAction={
              <Button
                size={ButtonSize.SM}
                className="h-8 gap-1.5 px-2.5 text-xs"
                isDisabled={isInterviewLoading}
                isLoading={isInterviewLoading}
                onClick={() => {
                  void startInterview();
                }}
                icon={<Sparkles className="size-3.5" />}
              >
                Start
              </Button>
            }
          >
            {idleScore !== null ? (
              <ProgressBar label={`${idleScore}%`} percent={idleScore} />
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">
              New interview: {INTERVIEW_CREDIT_COST} credits. Resume is free.
            </p>
            {error ? (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </Card>
        </div>
      </Container>
    );
  }

  if (status === 'complete') {
    return (
      <Container>
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          <Card
            label="Interview complete"
            description={`Brand context is updated. Completeness is ${completenessScore}%.`}
            headerAction={
              <Button
                size={ButtonSize.SM}
                className="h-8 px-2.5 text-xs"
                onClick={() => {
                  window.location.reload();
                }}
              >
                Run again
              </Button>
            }
          >
            <ProgressBar
              label={`${completenessScore}%`}
              percent={completenessScore}
            />
          </Card>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mx-auto flex max-w-xl flex-col gap-3">
        <Card
          label="Interview"
          description={
            progress
              ? `${progress.answeredFields} of ${progress.totalFields} answered`
              : 'One question at a time. Drafts survive refresh.'
          }
        >
          {progress ? (
            <div className="mb-4">
              <ProgressBar
                label={`${progress.percentComplete}%`}
                percent={progress.percentComplete}
              />
            </div>
          ) : null}

          {currentQuestion ? (
            <form className="flex flex-col gap-3" onSubmit={handleFormSubmit}>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {currentQuestion.group}
                  {currentQuestion.isRequired ? ' · required' : ''}
                </p>
                <h2 className="mt-1 text-sm font-medium leading-snug text-foreground">
                  {currentQuestion.questionText}
                </h2>
                {currentQuestion.hint ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {currentQuestion.hint}
                  </p>
                ) : null}
              </div>

              <InlineAnswer
                question={currentQuestion}
                value={answerValue}
                onChange={setAnswerValue}
                isDisabled={isInterviewLoading}
                onSubmit={() => {
                  void handleSubmit();
                }}
              />

              {/* Keep a compact freeform editor for long list pastes */}
              {currentQuestion.answerType === 'list' &&
              answerValue.includes('\n') &&
              answerValue.length > 80 ? (
                <Textarea
                  aria-label="Edit full list"
                  className="min-h-[72px] text-xs"
                  value={answerValue}
                  disabled={isInterviewLoading}
                  onChange={(event) => setAnswerValue(event.target.value)}
                />
              ) : null}

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="submit"
                  size={ButtonSize.SM}
                  className="h-8 px-3 text-xs"
                  isDisabled={isInterviewLoading || !answerValue.trim()}
                  isLoading={isInterviewLoading}
                >
                  Continue
                </Button>
                <Button
                  type="button"
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  className="h-8 px-2 text-xs"
                  isDisabled={isInterviewLoading}
                  onClick={() => {
                    void handleSkip();
                  }}
                >
                  Skip
                </Button>
              </div>
            </form>
          ) : (
            <Loading isFullSize={false} />
          )}
        </Card>
      </div>
    </Container>
  );
}
