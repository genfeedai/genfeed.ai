import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import type { ReactElement } from 'react';
import type { UseTextActionReturn } from '~hooks/use-text-action';

const MODE_LABELS = {
  proofread: 'Proofread',
  rewrite: 'Rewrite in my voice',
} as const;

/**
 * Proofread and Rewrite for the draft in the page's composer. The suggestion is
 * shown here; the composer changes only on Apply, and Undo puts it back.
 */
export function TextActionPanel({
  hasActions = true,
  textAction,
}: {
  /** Show the Proofread and Rewrite buttons; the empty state offers them as chips instead. */
  hasActions?: boolean;
  textAction: UseTextActionReturn;
}): ReactElement {
  const { error, mode, original, phase, result } = textAction;
  const isWorking = phase === 'working';

  return (
    <section aria-label="Edit my draft" className="mb-2 space-y-2">
      {hasActions ? (
        <div className="flex flex-wrap gap-2">
          {(['proofread', 'rewrite'] as const).map((action) => (
            <Button
              key={action}
              type="button"
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              isDisabled={isWorking}
              onClick={() => {
                void textAction.start(action);
              }}
            >
              {MODE_LABELS[action]}
            </Button>
          ))}
        </div>
      ) : null}

      {isWorking ? (
        <div role="status" className="flex items-center gap-2">
          <Spinner className="size-4" />
          <span className="text-xs text-muted-foreground">
            {mode === 'proofread'
              ? 'Proofreading your draft…'
              : 'Rewriting in your voice…'}
          </span>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {result && (phase === 'preview' || phase === 'applied') ? (
        <div className="space-y-2 rounded-lg border border-border bg-background-secondary p-3">
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {result.text}
          </p>
          {result.voiceHint ? (
            <p className="text-xs text-muted-foreground">{result.voiceHint}</p>
          ) : null}
          <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
            Original: {original}
          </p>
          <div className="flex justify-end gap-2">
            {phase === 'applied' ? (
              <>
                <Button
                  type="button"
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  onClick={() => {
                    void textAction.undo();
                  }}
                >
                  Undo
                </Button>
                <Button
                  type="button"
                  size={ButtonSize.SM}
                  onClick={textAction.dismiss}
                >
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  onClick={textAction.dismiss}
                >
                  Dismiss
                </Button>
                <Button
                  type="button"
                  size={ButtonSize.SM}
                  onClick={() => {
                    void textAction.apply();
                  }}
                >
                  Apply
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
