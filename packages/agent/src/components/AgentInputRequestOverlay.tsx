import type { AgentInputRequest } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { type ReactElement, useMemo, useState } from 'react';

interface AgentInputRequestOverlayProps {
  isSubmitting?: boolean;
  onSubmit: (answer: string) => void | Promise<void>;
  request: AgentInputRequest;
  variant?: 'composer' | 'inline' | 'overlay';
}

export function AgentInputRequestOverlay({
  isSubmitting = false,
  onSubmit,
  request,
  variant = 'overlay',
}: AgentInputRequestOverlayProps): ReactElement {
  const recommendedLabel = useMemo(
    () =>
      request.options?.find(
        (option) => option.id === request.recommendedOptionId,
      )?.label ?? '',
    [request.options, request.recommendedOptionId],
  );
  const [freeTextAnswer, setFreeTextAnswer] = useState('');
  const isComposer = variant === 'composer';

  return (
    <div
      className={
        isComposer
          ? 'w-full'
          : variant === 'inline'
            ? 'mx-auto my-4 w-full max-w-3xl'
            : 'absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'
      }
    >
      <div
        className={
          isComposer
            ? 'max-h-[min(50dvh,24rem)] w-full overflow-y-auto rounded-lg border border-primary/25 bg-background-secondary/96 p-3 shadow-border'
            : variant === 'inline'
              ? 'w-full border border-primary/30 bg-[#0d0f16] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.28)]'
              : 'w-full max-w-4xl border border-primary/50 bg-[#0d0f16] p-6 shadow-2xl'
        }
      >
        <div className={isComposer ? 'mb-3' : 'mb-4'}>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Interaction
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
          {request.options?.map((option, index) => {
            const isRecommended = option.id === request.recommendedOptionId;
            return (
              <Button
                key={option.id}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                isDisabled={isSubmitting}
                onClick={() => {
                  void onSubmit(option.label);
                }}
                className={
                  isComposer
                    ? 'flex w-full items-start gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-hover disabled:opacity-50'
                    : 'flex w-full items-start gap-4 border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.04] disabled:opacity-50'
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
                    {isRecommended ? ' (Recommended)' : ''}
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

        {request.allowFreeText !== false ? (
          <div className={isComposer ? 'mt-3' : 'mt-4'}>
            <Textarea
              aria-label="Custom answer"
              value={freeTextAnswer}
              onChange={(event) => setFreeTextAnswer(event.target.value)}
              placeholder={
                recommendedLabel
                  ? `Type your own answer, or leave this blank to use "${recommendedLabel}"`
                  : 'Type your answer'
              }
              className={
                isComposer
                  ? 'min-h-16 resize-none border-border bg-background px-3 py-2 text-xs placeholder:text-foreground/35 focus:border-primary/50'
                  : 'min-h-28 border-white/[0.08] bg-transparent px-4 py-3 placeholder:text-foreground/35 focus:border-primary/50'
              }
            />
          </div>
        ) : null}

        <div
          className={
            isComposer ? 'mt-3 flex justify-end' : 'mt-6 flex justify-end'
          }
        >
          <Button
            onClick={() => {
              const fallbackAnswer =
                recommendedLabel ||
                request.options?.[0]?.label ||
                freeTextAnswer.trim();
              void onSubmit(freeTextAnswer.trim() || fallbackAnswer);
            }}
            isDisabled={
              isSubmitting ||
              (request.allowFreeText !== false &&
                !freeTextAnswer.trim() &&
                !recommendedLabel &&
                !request.options?.length)
            }
          >
            Submit answers
          </Button>
        </div>
      </div>
    </div>
  );
}
