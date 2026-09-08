import { ButtonVariant } from '@genfeedai/contracts';
import type { AgentInputRequestOverlayProps } from '@genfeedai/props/ui/agent/agent-input-request-overlay.props';
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
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const requestIdRef = useRef(request.inputRequestId);
  const isComposer = variant === 'composer';

  useEffect(() => {
    requestIdRef.current = request.inputRequestId;
    setFreeTextAnswer('');
    setSelectedOptionId(null);
    setSubmissionError(null);
    submittingRef.current = false;
  }, [request.inputRequestId]);

  async function submitAnswer(
    answer: string,
    optionId: string | null = null,
  ): Promise<void> {
    if (!answer.trim() || isSubmitting || submittingRef.current) return;
    const requestId = request.inputRequestId;
    submittingRef.current = true;
    setSelectedOptionId(optionId);
    setSubmissionError(null);
    try {
      await onSubmit(answer.trim());
    } catch {
      if (requestIdRef.current === requestId) {
        setSelectedOptionId(null);
        setSubmissionError(translate('failed'));
      }
    } finally {
      if (requestIdRef.current === requestId) submittingRef.current = false;
    }
  }

  return (
    <div
      className={
        isComposer
          ? 'w-full'
          : variant === 'inline'
            ? 'mx-auto my-4 w-full max-w-3xl'
            : 'absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm' /* design-system-allow-content-color */
      }
    >
      <div
        className={
          isComposer
            ? 'max-h-[min(50dvh,24rem)] w-full overflow-y-auto rounded-lg border border-primary/25 bg-background-secondary/96 p-3 shadow-border'
            : variant === 'inline'
              ? 'w-full border border-primary/30 bg-background-secondary p-6 shadow-ambient-lg'
              : 'w-full max-w-4xl border border-primary/50 bg-background-secondary p-6 shadow-ambient-lg'
        }
      >
        <div className={isComposer ? 'mb-3' : 'mb-4'}>
          <p className="mb-1 text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {translate('interaction')}
          </p>
          <h3
            className={
              isComposer
                ? 'text-sm font-semibold text-foreground'
                : 'text-2xl font-semibold text-foreground'
            }
          >
            {request.title}
          </h3>
          <p
            className={
              isComposer
                ? 'mt-1 text-xs leading-5 text-foreground/70'
                : 'mt-3 text-sm text-foreground/70'
            }
          >
            {request.prompt}
          </p>
        </div>

        <div className="space-y-3">
          {visibleOptions
            .filter(
              (option) => !selectedOptionId || option.id === selectedOptionId,
            )
            .map((option, index) => {
              const isRecommended = option.id === request.recommendedOptionId;
              const isSelected = selectedOptionId === option.id;
              return (
                <Button
                  key={option.id}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  isDisabled={isSubmitting}
                  aria-pressed={isSelected}
                  onClick={() => {
                    void submitAnswer(option.label, option.id);
                  }}
                  className={
                    isComposer
                      ? `flex w-full items-start gap-3 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-hover disabled:opacity-50 ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-background'
                            : 'border-border'
                        }`
                      : `flex w-full items-start gap-4 border bg-foreground/[0.02] px-5 py-4 text-left transition-colors hover:border-primary/40 hover:bg-foreground/[0.04] disabled:opacity-50 ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-background'
                            : 'border-border'
                        }`
                  }
                >
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.04] text-xs text-foreground/70">
                    {index + 1}
                  </span>
                  <span className="block">
                    <span
                      className={
                        isComposer
                          ? 'block text-xs font-medium text-foreground'
                          : 'block text-lg font-semibold text-foreground'
                      }
                    >
                      {option.label}
                      {isRecommended ? translate('recommended') : ''}
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

        <div className={isComposer ? 'mt-3' : 'mt-4'}>
          <p className="mb-1 text-2xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {translate('other')}
          </p>
          {submissionError ? (
            <p role="alert" className="mb-2 text-xs text-destructive">
              {submissionError}
            </p>
          ) : null}
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
                : 'min-h-28 border-border bg-transparent px-4 py-3 placeholder:text-foreground/35 focus:border-primary/50'
            }
          />
        </div>

        <div
          className={
            isComposer ? 'mt-3 flex justify-end' : 'mt-6 flex justify-end'
          }
        >
          <Button
            onClick={() => {
              const fallbackAnswer =
                recommendedLabel ||
                visibleOptions[0]?.label ||
                freeTextAnswer.trim();
              void submitAnswer(freeTextAnswer.trim() || fallbackAnswer);
            }}
            isDisabled={
              isSubmitting ||
              (!freeTextAnswer.trim() &&
                !recommendedLabel &&
                !visibleOptions.length)
            }
          >
            {translate(freeTextAnswer.trim() ? 'useAnswer' : 'submit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
