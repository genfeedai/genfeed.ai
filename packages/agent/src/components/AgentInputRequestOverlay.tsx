import { ButtonVariant } from '@genfeedai/contracts';
import type { AgentInputRequestOverlayProps } from '@genfeedai/props/ui/agent/agent-input-request-overlay.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';

const MAX_PICK_ONE_OPTIONS = 5;

export function AgentInputRequestOverlay({
  isSubmitting = false,
  onSubmit,
  request,
  variant = 'overlay',
}: AgentInputRequestOverlayProps): ReactElement {
  const translate = useTranslations('agent.inputRequest');
  const recommendedLabel = useMemo(
    () =>
      request.options?.find(
        (option) => option.id === request.recommendedOptionId,
      )?.label ?? '',
    [request.options, request.recommendedOptionId],
  );
  const visibleOptions = useMemo(
    () => (request.options ?? []).slice(0, MAX_PICK_ONE_OPTIONS),
    [request.options],
  );
  const [freeTextAnswer, setFreeTextAnswer] = useState('');
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const requestIdRef = useRef(request.inputRequestId);
  requestIdRef.current = request.inputRequestId;
  const isComposer = variant === 'composer';
  const isInline = variant === 'inline' || isComposer;

  // biome-ignore lint/correctness/useExhaustiveDependencies: A new request resets the answer even when the overlay stays mounted.
  useEffect(() => {
    setFreeTextAnswer('');
    setSelectedOptionId(null);
    setSelectedOptionIds([]);
    setSubmissionError(null);
    submittingRef.current = false;
  }, [request.inputRequestId]);

  async function submitAnswer(
    answer: string,
    optionId: string | null = null,
    optionIds?: string[],
  ): Promise<void> {
    if (!answer.trim() || isSubmitting || submittingRef.current) return;
    const requestId = request.inputRequestId;
    submittingRef.current = true;
    setSelectedOptionId(optionId);
    setSubmissionError(null);
    try {
      if (optionIds) await onSubmit(answer.trim(), optionIds);
      else if (optionId) await onSubmit(answer.trim(), [optionId]);
      else await onSubmit(answer.trim());
    } catch {
      if (requestIdRef.current === requestId) {
        setSelectedOptionId(null);
        setSubmissionError(translate('failed'));
      }
    } finally {
      if (requestIdRef.current === requestId) submittingRef.current = false;
    }
  }

  const selectedOptions = visibleOptions.filter((option) =>
    selectedOptionIds.includes(option.id),
  );

  function toggleOption(id: string): void {
    if (isSubmitting || submittingRef.current) return;
    setSelectedOptionIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < (request.maxSelections ?? visibleOptions.length)
          ? [...current, id]
          : current,
    );
  }

  return (
    <div
      className={
        isComposer
          ? 'w-full'
          : variant === 'inline'
            ? 'w-full'
            : 'absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm' /* design-system-allow-content-color */
      }
    >
      <div
        className={cn(
          'w-full border border-border bg-background-secondary shadow-border',
          isComposer
            ? 'max-h-[min(50dvh,24rem)] overflow-y-auto rounded-lg p-3'
            : variant === 'inline'
              ? 'rounded-lg p-4'
              : 'max-w-4xl p-6 shadow-ambient-lg',
        )}
      >
        <div className={isInline ? 'mb-3' : 'mb-4'}>
          <p className="mb-1 text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {translate(
              request.isMultiSelect ? 'chooseMultiple' : 'interaction',
            )}
          </p>
          <h3
            className={
              isInline
                ? 'text-sm font-semibold text-foreground'
                : 'text-2xl font-semibold text-foreground'
            }
          >
            {request.title}
          </h3>
          <p
            className={
              isInline
                ? 'mt-1 text-xs leading-5 text-foreground/70'
                : 'mt-3 text-sm text-foreground/70'
            }
          >
            {request.prompt}
          </p>
        </div>

        <div
          className={cn(
            'flex gap-2',
            request.isMultiSelect ? 'flex-wrap' : 'flex-col',
          )}
        >
          {visibleOptions
            .filter(
              (option) =>
                request.isMultiSelect ||
                !selectedOptionId ||
                option.id === selectedOptionId,
            )
            .map((option, index) => {
              const isRecommended = option.id === request.recommendedOptionId;
              const isSelected = request.isMultiSelect
                ? selectedOptionIds.includes(option.id)
                : selectedOptionId === option.id;
              return (
                <Button
                  key={option.id}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  isDisabled={
                    isSubmitting ||
                    (request.isMultiSelect === true &&
                      !(
                        Array.isArray(
                          request.metadata?.submitImmediatelyOptionIds,
                        ) &&
                        request.metadata.submitImmediatelyOptionIds.includes(
                          option.id,
                        )
                      ) &&
                      !isSelected &&
                      selectedOptionIds.length >=
                        (request.maxSelections ?? visibleOptions.length))
                  }
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (
                      Array.isArray(
                        request.metadata?.submitImmediatelyOptionIds,
                      ) &&
                      request.metadata.submitImmediatelyOptionIds.includes(
                        option.id,
                      )
                    )
                      void submitAnswer(option.label, option.id);
                    else if (request.isMultiSelect) toggleOption(option.id);
                    else void submitAnswer(option.label, option.id);
                  }}
                  className={cn(
                    'flex items-start gap-3 border bg-background px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-hover disabled:opacity-50',
                    request.isMultiSelect
                      ? 'rounded-full'
                      : 'w-full rounded-lg',
                    isSelected
                      ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-background'
                      : 'border-border',
                  )}
                >
                  {!request.isMultiSelect ? (
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.04] text-xs text-foreground/70"
                    >
                      {index + 1}
                    </span>
                  ) : null}
                  <span className="block min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          isInline
                            ? 'text-xs font-medium text-foreground'
                            : 'text-sm font-semibold text-foreground'
                        }
                      >
                        {option.label}
                      </span>
                      {isRecommended ? (
                        <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-2xs font-medium uppercase tracking-[0.12em] text-foreground/55">
                          {translate('recommended')}
                        </span>
                      ) : null}
                    </span>
                    {option.description ? (
                      <span className="mt-1 block text-xs text-foreground/55">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </Button>
              );
            })}
        </div>

        {submissionError ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {submissionError}
          </p>
        ) : null}
        {request.allowFreeText !== false ? (
          <div className={isInline ? 'mt-3' : 'mt-4'}>
            <p className="mb-1 text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {translate('other')}
            </p>
            <Textarea
              disabled={isSubmitting}
              aria-label={translate('other')}
              value={freeTextAnswer}
              onChange={(event) => setFreeTextAnswer(event.target.value)}
              placeholder={
                recommendedLabel
                  ? translate('placeholderRecommended', {
                      recommended: recommendedLabel,
                    })
                  : translate('placeholder')
              }
              className={
                isComposer
                  ? 'min-h-16 resize-none border-border bg-background px-3 py-2 text-xs placeholder:text-foreground/35 focus:border-primary/50'
                  : 'min-h-20 resize-none border-border bg-background px-3 py-2 text-sm placeholder:text-foreground/35 focus:border-primary/50'
              }
            />
          </div>
        ) : null}

        {request.isMultiSelect || request.allowFreeText !== false ? (
          <div
            className={
              isInline ? 'mt-3 flex justify-end' : 'mt-6 flex justify-end'
            }
          >
            <Button
              onClick={() => {
                if (freeTextAnswer.trim() && request.allowFreeText !== false) {
                  void submitAnswer(freeTextAnswer.trim());
                } else if (request.isMultiSelect) {
                  void submitAnswer(
                    selectedOptions.map((option) => option.label).join(', '),
                    null,
                    selectedOptions.map((option) => option.id),
                  );
                } else {
                  const option =
                    visibleOptions.find(
                      (item) => item.id === request.recommendedOptionId,
                    ) ?? visibleOptions[0];
                  if (option) void submitAnswer(option.label, option.id);
                }
              }}
              isDisabled={
                isSubmitting ||
                (!(request.allowFreeText !== false && freeTextAnswer.trim()) &&
                  (request.isMultiSelect
                    ? !selectedOptions.length
                    : !visibleOptions.length))
              }
            >
              {translate(freeTextAnswer.trim() ? 'useAnswer' : 'submit')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
