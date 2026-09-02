'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  BrandInterviewAnswerValue,
  BrandInterviewGroup,
  IBrandInterviewQuestion,
  IBrandInterviewStep,
} from '@genfeedai/contracts/interfaces';
import { personalizeBrandInterviewExamples } from '@genfeedai/helpers';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import { useBrandInterview } from '@hooks/utils/use-brand-interview/use-brand-interview';
import { BrandInterviewService } from '@services/social/brand-interview.service';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { Check, Circle, Sparkles } from 'lucide-react';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useBrandInterviewDraftStore } from '@/store/brand-interview-draft.store';

const INTERVIEW_CREDIT_COST = 10;

const GROUP_LABELS: Record<BrandInterviewGroup, string> = {
  identity: 'Identity',
  strategy: 'Strategy',
  voice: 'Voice',
};

type BrandExampleContext = {
  brandName?: string | null;
  description?: string | null;
};

function parseListDraft(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function serializeListDraft(items: string[]): string {
  return items.join('\n');
}

function answerValueToDraft(
  value: BrandInterviewAnswerValue | undefined,
): string {
  if (value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return serializeListDraft(value);
  }
  return value;
}

function ProgressBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
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
  brandContext,
}: {
  value: string;
  onChange: (next: string) => void;
  examples?: string[];
  isDisabled?: boolean;
  brandContext: BrandExampleContext;
}) {
  const chips = useMemo(() => parseListDraft(value), [value]);
  const personalizedExamples = useMemo(
    () => personalizeBrandInterviewExamples(examples, brandContext),
    [brandContext, examples],
  );

  const removeChip = useCallback(
    (chip: string) => {
      onChange(serializeListDraft(chips.filter((item) => item !== chip)));
    },
    [chips, onChange],
  );

  const appendExample = useCallback(
    (example: string) => {
      if (chips.some((chip) => chip.toLowerCase() === example.toLowerCase())) {
        return;
      }
      onChange(serializeListDraft([...chips, example]));
    },
    [chips, onChange],
  );

  return (
    <div className="flex flex-col gap-3">
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

      <Textarea
        id="interview-answer-list"
        aria-label="Interview list answer"
        placeholder="One item per line (or comma-separated)…"
        className="min-h-32 text-sm"
        value={value}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value)}
      />

      {personalizedExamples.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {personalizedExamples.map((example) => {
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
                className="h-7 max-w-full truncate px-2 text-2xs"
                onClick={() => appendExample(example)}
              >
                {example}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function InlineAnswer({
  question,
  value,
  onChange,
  isDisabled,
  brandContext,
}: {
  question: IBrandInterviewQuestion;
  value: string;
  onChange: (val: string) => void;
  isDisabled?: boolean;
  brandContext: BrandExampleContext;
}) {
  const personalizedExamples = useMemo(
    () => personalizeBrandInterviewExamples(question.examples, brandContext),
    [brandContext, question.examples],
  );

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
        brandContext={brandContext}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        id="interview-answer-text"
        aria-label="Interview answer"
        placeholder={
          personalizedExamples[0] ||
          'Write a full answer — longer answers help agents sound like this brand.'
        }
        className="min-h-40 text-sm"
        value={value}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {personalizedExamples.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {personalizedExamples.map((example) => (
            <Button
              key={example}
              type="button"
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              isDisabled={isDisabled}
              className="h-auto max-w-full whitespace-normal px-2 py-1 text-left text-2xs leading-snug"
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

function StepStatusIcon({ status }: { status: IBrandInterviewStep['status'] }) {
  if (status === 'answered') {
    return <Check className="size-3.5 text-primary" aria-hidden />;
  }
  if (status === 'current') {
    return (
      <span
        className="size-2.5 rounded-full bg-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_25%,transparent)]"
        aria-hidden
      />
    );
  }
  if (status === 'skipped') {
    return <Circle className="size-3.5 text-muted-foreground/50" aria-hidden />;
  }
  return <Circle className="size-3.5 text-muted-foreground/30" aria-hidden />;
}

function InterviewStepsSidebar({
  steps,
  selectedFieldKey,
  onSelect,
  isDisabled,
}: {
  steps: IBrandInterviewStep[];
  selectedFieldKey: string | null;
  onSelect: (fieldKey: string) => void;
  isDisabled?: boolean;
}) {
  const groups = useMemo(() => {
    const order: BrandInterviewGroup[] = ['identity', 'voice', 'strategy'];
    return order
      .map((group) => ({
        group,
        items: steps.filter((step) => step.group === group),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [steps]);

  if (steps.length === 0) {
    return null;
  }

  return (
    <Card className="xl:sticky xl:top-4" bodyClassName="gap-3 p-4">
      <div className="mb-3 space-y-1">
        <h2 className="text-sm font-semibold">Steps</h2>
        <p className="text-xs text-muted-foreground">
          Jump back to answered steps anytime. Upcoming stays locked until you
          reach them.
        </p>
      </div>

      <nav aria-label="Interview steps" className="space-y-4">
        {groups.map(({ group, items }) => (
          <div key={group} className="space-y-1.5">
            <p className="px-1 text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {GROUP_LABELS[group]}
            </p>
            <ul className="space-y-1">
              {items.map((step, index) => {
                const isSelected = step.fieldKey === selectedFieldKey;
                const isClickable = step.isNavigable && !isDisabled;

                return (
                  <li key={step.fieldKey}>
                    <Button
                      type="button"
                      variant={ButtonVariant.UNSTYLED}
                      withWrapper={false}
                      isDisabled={!isClickable}
                      onClick={() => {
                        if (isClickable) {
                          onSelect(step.fieldKey);
                        }
                      }}
                      className={[
                        'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors',
                        isSelected
                          ? 'bg-primary/10 text-foreground'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                        !step.isNavigable ? 'cursor-default opacity-60' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      ariaLabel={`${GROUP_LABELS[group]} step ${index + 1}: ${step.label}`}
                    >
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                        <StepStatusIcon status={step.status} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium leading-snug text-foreground">
                          {step.label.length > 72
                            ? `${step.label.slice(0, 72)}…`
                            : step.label}
                        </span>
                        {step.answerPreview ? (
                          <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                            {step.answerPreview}
                          </span>
                        ) : null}
                        {step.status === 'current' ? (
                          <span className="mt-0.5 block text-2xs font-medium uppercase tracking-wide text-primary">
                            Current
                          </span>
                        ) : null}
                        {step.status === 'skipped' ? (
                          <span className="mt-0.5 block text-2xs uppercase tracking-wide text-muted-foreground">
                            Skipped
                          </span>
                        ) : null}
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </Card>
  );
}

/**
 * Brand interview — one question at a time on the full main canvas, with a
 * secondary steps rail for revisiting answers. Drafts live in Zustand
 * (localStorage) so a refresh does not wipe mid-type answers.
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
    steps,
    answeredFields,
    startInterview,
    submitAnswer,
    skipQuestion,
  } = useBrandInterview(brandId || null);

  const getInterviewService = useAuthedService((token: string) =>
    BrandInterviewService.getInstance(token),
  );

  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);
  const [idleScore, setIdleScore] = useState<number | null>(null);

  const frontierFieldKey = currentQuestion?.fieldKey ?? null;

  useEffect(() => {
    if (!frontierFieldKey) {
      return;
    }

    setSelectedFieldKey((previous) => {
      if (!previous) {
        return frontierFieldKey;
      }
      const stillNavigable = steps.some(
        (step) => step.fieldKey === previous && step.isNavigable,
      );
      return stillNavigable ? previous : frontierFieldKey;
    });
  }, [frontierFieldKey, steps]);

  const selectedStep = useMemo(
    () => steps.find((step) => step.fieldKey === selectedFieldKey) ?? null,
    [selectedFieldKey, steps],
  );

  const activeQuestion = selectedStep?.question ?? currentQuestion ?? null;
  const fieldKey = activeQuestion?.fieldKey;
  const isEditingPastAnswer =
    Boolean(fieldKey) &&
    Boolean(frontierFieldKey) &&
    fieldKey !== frontierFieldKey;

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

  // Seed drafts from server answers when opening a past step with an empty draft.
  useEffect(() => {
    if (!brandId || !fieldKey) {
      return;
    }
    const existingDraft = useBrandInterviewDraftStore
      .getState()
      .getAnswer(brandId, fieldKey);
    if (existingDraft.trim()) {
      return;
    }
    const saved = answerValueToDraft(answeredFields[fieldKey]);
    if (saved) {
      setDraftAnswer(brandId, fieldKey, saved);
    }
  }, [answeredFields, brandId, fieldKey, setDraftAnswer]);

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
    if (!brandId || !activeQuestion) {
      return;
    }
    const trimmed = answerValue.trim();
    if (!trimmed) {
      return;
    }

    const submitFieldKey = isEditingPastAnswer
      ? activeQuestion.fieldKey
      : undefined;

    await submitAnswer(trimmed, submitFieldKey);
    clearDraftAnswer(brandId, activeQuestion.fieldKey);

    if (isEditingPastAnswer) {
      // Stay on this step so the user can confirm the saved answer; frontier
      // remains available in the steps rail under Current.
      setSelectedFieldKey(activeQuestion.fieldKey);
    }
  }, [
    activeQuestion,
    answerValue,
    brandId,
    clearDraftAnswer,
    isEditingPastAnswer,
    submitAnswer,
  ]);

  const handleSkip = useCallback(async () => {
    if (!brandId || !currentQuestion || isEditingPastAnswer) {
      return;
    }
    await skipQuestion();
    clearDraftAnswer(brandId, currentQuestion.fieldKey);
  }, [
    brandId,
    clearDraftAnswer,
    currentQuestion,
    isEditingPastAnswer,
    skipQuestion,
  ]);

  const handleFormSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      void handleSubmit();
    },
    [handleSubmit],
  );

  const handleSelectStep = useCallback((nextFieldKey: string) => {
    setSelectedFieldKey(nextFieldKey);
  }, []);

  const brandContext = useMemo<BrandExampleContext>(
    () => ({
      brandName: brand?.label || brand?.slug,
      description: brand?.description,
    }),
    [brand?.description, brand?.label, brand?.slug],
  );

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Card bodyClassName="gap-3 p-4">
        <p className="text-sm text-muted-foreground">Brand not found.</p>
      </Card>
    );
  }

  if (status === 'idle') {
    return (
      <div className="space-y-4">
        <Card bodyClassName="gap-3 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Brand context
              </p>
              <h1 className="text-xl font-semibold tracking-tight">
                Interview {brand.label || 'this brand'}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Fill identity, voice, and strategy gaps one question at a time.
                Answers update brand context so agents write like you.
              </p>
            </div>
            <Button
              size={ButtonSize.SM}
              className="h-9 shrink-0 gap-1.5 px-3 text-xs"
              isDisabled={isInterviewLoading}
              isLoading={isInterviewLoading}
              onClick={() => {
                void startInterview();
              }}
              icon={<Sparkles className="size-3.5" />}
            >
              Start interview
            </Button>
          </div>

          <div className="mt-6 max-w-xl space-y-3">
            {idleScore !== null ? (
              <ProgressBar label={`${idleScore}%`} percent={idleScore} />
            ) : null}
            <p className="text-xs text-muted-foreground">
              New interview: {INTERVIEW_CREDIT_COST} credits. Resume is free.
            </p>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    );
  }

  if (status === 'complete') {
    return (
      <div className="space-y-4">
        <Card bodyClassName="gap-3 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Brand context
              </p>
              <h1 className="text-xl font-semibold tracking-tight">
                Interview complete
              </h1>
              <p className="text-sm text-muted-foreground">
                Brand context is updated. Completeness is {completenessScore}%.
              </p>
            </div>
            <Button
              size={ButtonSize.SM}
              className="h-9 px-3 text-xs"
              onClick={() => {
                window.location.reload();
              }}
            >
              Run again
            </Button>
          </div>
          <div className="mt-6 max-w-xl">
            <ProgressBar
              label={`${completenessScore}%`}
              percent={completenessScore}
            />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.75fr)]">
        <Card bodyClassName="gap-3 p-4">
          <div className="mb-6 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Brand context
                </p>
                <h1 className="text-xl font-semibold tracking-tight">
                  {brand.label || 'Brand interview'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {progress
                    ? `${progress.answeredFields} of ${progress.totalFields} answered`
                    : 'One question at a time. Drafts survive refresh.'}
                  {isEditingPastAnswer ? ' · Editing a previous answer' : ''}
                </p>
              </div>
            </div>
            {progress ? (
              <ProgressBar
                label={`${progress.percentComplete}%`}
                percent={progress.percentComplete}
              />
            ) : null}
          </div>

          {activeQuestion ? (
            <form className="flex flex-col gap-5" onSubmit={handleFormSubmit}>
              <div className="space-y-2">
                <p className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {GROUP_LABELS[activeQuestion.group] ?? activeQuestion.group}
                  {activeQuestion.isRequired ? ' · required' : ''}
                </p>
                <h2 className="text-lg font-semibold leading-snug text-foreground">
                  {activeQuestion.questionText}
                </h2>
                {activeQuestion.hint ? (
                  <p className="max-w-3xl text-sm text-muted-foreground">
                    {activeQuestion.hint}
                  </p>
                ) : null}
              </div>

              <InlineAnswer
                question={activeQuestion}
                value={answerValue}
                onChange={setAnswerValue}
                isDisabled={isInterviewLoading}
                brandContext={brandContext}
              />

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="submit"
                  size={ButtonSize.SM}
                  className="h-9 px-4 text-xs"
                  isDisabled={isInterviewLoading || !answerValue.trim()}
                  isLoading={isInterviewLoading}
                >
                  {isEditingPastAnswer ? 'Save answer' : 'Continue'}
                </Button>
                {!isEditingPastAnswer ? (
                  <Button
                    type="button"
                    size={ButtonSize.SM}
                    variant={ButtonVariant.GHOST}
                    className="h-9 px-3 text-xs"
                    isDisabled={isInterviewLoading}
                    onClick={() => {
                      void handleSkip();
                    }}
                  >
                    Skip
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size={ButtonSize.SM}
                    variant={ButtonVariant.GHOST}
                    className="h-9 px-3 text-xs"
                    isDisabled={isInterviewLoading || !frontierFieldKey}
                    onClick={() => {
                      if (frontierFieldKey) {
                        setSelectedFieldKey(frontierFieldKey);
                      }
                    }}
                  >
                    Back to current
                  </Button>
                )}
              </div>
            </form>
          ) : (
            <Loading isFullSize={false} />
          )}
        </Card>

        <InterviewStepsSidebar
          steps={steps}
          selectedFieldKey={selectedFieldKey}
          onSelect={handleSelectStep}
          isDisabled={isInterviewLoading}
        />
      </div>
    </div>
  );
}
