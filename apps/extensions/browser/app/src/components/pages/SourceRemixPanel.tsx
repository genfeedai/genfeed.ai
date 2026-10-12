import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  SourceRemixDraftView,
  SourceRemixQuoteView,
  SourceRemixResultView,
} from '~components/pages/SourceRemixViews';
import type {
  BrandRemixRunView,
  SourceRemixEdits,
  SourceRemixImageModel,
  SourceRemixPanelProps,
} from '~models/source-remix.model';
import { backgroundAction } from '~services/background-action';
import { useBrandStore } from '~store/use-brand-store';
import {
  failureReason,
  remixStage,
  variantProgress,
} from '~utils/source-remix-view.util';

const POLL_INTERVAL_MS = 4000;
const CLOCK_INTERVAL_MS = 15_000;

function messageOf(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message
    ? failure.message
    : fallback;
}

export function SourceRemixPanel({
  onClose,
  source,
}: SourceRemixPanelProps): ReactElement {
  const brandId = useBrandStore((state) => state.activeBrandId);
  const [run, setRun] = useState<BrandRemixRunView | null>(null);
  const [isOpening, setIsOpening] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<SourceRemixImageModel[]>([]);
  const [model, setModel] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!brandId) {
      setIsOpening(false);
      setError('Select a brand before remixing a source.');
      return;
    }
    const controller = new AbortController();
    setIsOpening(true);
    setError(null);
    backgroundAction<BrandRemixRunView>({
      brandId,
      event: 'sourceRemixOpen',
      sourceId: source.id,
    })
      .then((opened) => {
        if (!controller.signal.aborted) {
          setRun(opened);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(messageOf(failure, 'Could not start this remix.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsOpening(false);
        }
      });
    return () => controller.abort();
  }, [brandId, source.id]);

  const isImage = run?.draft.output.kind === 'image';
  useEffect(() => {
    if (!isImage || models.length > 0) {
      return;
    }
    const controller = new AbortController();
    backgroundAction<SourceRemixImageModel[]>({ event: 'sourceRemixModels' })
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setModels(loaded);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(messageOf(failure, 'Could not load image models.'));
        }
      });
    return () => controller.abort();
  }, [isImage, models.length]);

  const runId = run?.id;
  const isGenerating = run?.phase === 'generating';
  useEffect(() => {
    if (!runId || !isGenerating) {
      return;
    }
    const controller = new AbortController();
    const timer = setInterval(() => {
      backgroundAction<BrandRemixRunView>({ event: 'sourceRemixGet', runId })
        .then((next) => {
          if (!controller.signal.aborted) {
            setRun(next);
          }
        })
        .catch((failure: unknown) => {
          if (!controller.signal.aborted) {
            setError(messageOf(failure, 'Could not check this remix.'));
          }
        });
    }, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [runId, isGenerating]);

  const hasQuote = Boolean(run?.generationQuote);
  useEffect(() => {
    if (!hasQuote) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasQuote]);

  const act = useCallback(
    async (
      message: Record<string, unknown>,
      fallback: string,
    ): Promise<void> => {
      setIsBusy(true);
      setError(null);
      try {
        const next = await backgroundAction<BrandRemixRunView>(message);
        setRun(next);
        setNow(Date.now());
      } catch (failure) {
        setError(messageOf(failure, fallback));
      } finally {
        setIsBusy(false);
      }
    },
    [],
  );

  function edit(edits: SourceRemixEdits) {
    if (!run) return;
    setIsEditing(false);
    void act(
      {
        edits,
        event: 'sourceRemixRevise',
        expectedRevision: run.revision,
        runId: run.id,
      },
      'Could not change this remix.',
    );
  }

  async function openStudio() {
    if (!run) return;
    setIsBusy(true);
    setError(null);
    try {
      const url = await backgroundAction<string>({
        event: 'sourceRemixStudioUrl',
        runId: run.id,
      });
      await Promise.resolve(chrome.tabs.create({ url }));
    } catch (failure) {
      setError(messageOf(failure, 'Could not open Genfeed.'));
    } finally {
      setIsBusy(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError('Could not copy this text.');
    }
  }

  const stage = run ? remixStage(run, now, isEditing) : null;
  const progress = run ? variantProgress(run) : null;

  return (
    <section
      aria-label="Remix now"
      className="space-y-3 rounded-xl border border-border bg-card p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold">Remix now</h3>
          <p className="truncate text-xs text-muted-foreground">
            {`From "${source.snapshot.title}" · the original stays unchanged`}
          </p>
        </div>
        <Button onClick={onClose} type="button" variant={ButtonVariant.GHOST}>
          Close
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {isOpening ? (
        <div className="flex items-center gap-2" role="status">
          <Spinner className="size-4 text-primary" />
          <p className="text-xs text-muted-foreground">Preparing your remix…</p>
        </div>
      ) : null}
      {run && stage === 'draft' ? (
        <SourceRemixDraftView
          isBusy={isBusy}
          model={model}
          models={models}
          onEdit={edit}
          onModelChange={setModel}
          onQuote={() => {
            setIsEditing(false);
            void act(
              {
                event: 'sourceRemixQuote',
                expectedRevision: run.revision,
                ...(isImage ? { model } : {}),
                runId: run.id,
              },
              'Could not price this remix.',
            );
          }}
          run={run}
        />
      ) : null}
      {run && stage === 'quoted' ? (
        <SourceRemixQuoteView
          isBusy={isBusy}
          onApprove={() => {
            void act(
              {
                event: 'sourceRemixExecute',
                expectedRevision: run.revision,
                quoteId: run.generationQuote?.id,
                runId: run.id,
              },
              'Could not start this generation.',
            );
          }}
          onChange={() => setIsEditing(true)}
          run={run}
        />
      ) : null}
      {run && stage === 'generating' && progress ? (
        <div className="space-y-1" role="status">
          <div className="flex items-center gap-2">
            <Spinner className="size-4 text-primary" />
            <p className="text-sm">
              {`Generating ${progress.ready} of ${progress.total}…`}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            You can close this panel. Reopen Remix now on this source to see
            progress.
          </p>
        </div>
      ) : null}
      {run && stage === 'done' ? (
        <SourceRemixResultView
          isBusy={isBusy}
          onCopy={(text) => {
            void copyText(text);
          }}
          onOpenStudio={() => {
            void openStudio();
          }}
          onRemixAgain={() => {
            void act(
              {
                brandId,
                event: 'sourceRemixCreate',
                sourceId: source.id,
              },
              'Could not start a new remix.',
            );
          }}
          run={run}
          sourceTitle={source.snapshot.title}
        />
      ) : null}
      {run && stage === 'failed' ? (
        <div className="space-y-2">
          <p className="text-xs text-destructive" role="alert">
            {`Generation failed. ${failureReason(run)}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Trying again needs a new price and your approval.
          </p>
          <Button
            isDisabled={isBusy}
            onClick={() => edit({ output: { count: run.draft.output.count } })}
            type="button"
          >
            Revise and try again
          </Button>
        </div>
      ) : null}
      {run && stage === 'studio' ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Video and avatar remixes continue in Genfeed Studio, where the scene
            plan is reviewed and priced scene by scene. Nothing is generated
            until you approve it there.
          </p>
          <Button
            isDisabled={isBusy}
            onClick={() => {
              void openStudio();
            }}
            type="button"
          >
            Open in Studio
          </Button>
        </div>
      ) : null}
    </section>
  );
}
