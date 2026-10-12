import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImportedSourceCard } from '~components/pages/ImportedSourceCard';
import { SourceCaptureCard } from '~components/pages/SourceCaptureCard';
import { BrandSelector } from '~components/settings/BrandSelector';
import {
  IMPORTED_SOURCES_CHANGED,
  type ImportedSourceKind,
  type ImportedSourceMediaView,
  type ImportedSourcesPageProps,
  type ImportedSourceView,
  type RawSourceCapture,
  type SourceCaptureRequest,
  type SourceSaveResult,
} from '~models/imported-source.model';
import {
  buildCapturePreview,
  classifySourceKind,
  defaultMediaIndex,
} from '~platforms/source-capture-snapshot';
import {
  BackgroundActionError,
  backgroundAction,
} from '~services/background-action';
import { useBrandStore } from '~store/use-brand-store';
import {
  canPrepareMedia,
  knowledgeHandoffFor,
} from '~utils/imported-source-labels.util';

const MEDIA_POLL_INTERVAL_MS = 4000;
const MAX_OBSERVED_SOURCES = 20;

type PageStatus = 'idle' | 'capturing' | 'saving';

function messageOf(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message
    ? failure.message
    : fallback;
}

function isActiveBrand(brandId: string): boolean {
  return useBrandStore.getState().activeBrandId === brandId;
}

function openUrl(url: string): void {
  Promise.resolve(chrome.tabs.create({ url })).catch(() =>
    window.open(url, '_blank', 'noopener,noreferrer'),
  );
}

export function ImportedSourcesPage({
  initialCapture,
  onAddToKnowledge,
  onUseReference,
}: ImportedSourcesPageProps) {
  const brandId = useBrandStore((state) => state.activeBrandId);
  const [capture, setCapture] = useState<RawSourceCapture | null>(null);
  const [kind, setKind] = useState<ImportedSourceKind>('page');
  const [mediaIndex, setMediaIndex] = useState<number | null>(null);
  const [sources, setSources] = useState<ImportedSourceView[]>([]);
  const [media, setMedia] = useState<Record<string, ImportedSourceMediaView>>(
    {},
  );
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState<PageStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletedSourceId, setDeletedSourceId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const preview = useMemo(
    () => (capture ? buildCapturePreview(capture, kind) : null),
    [capture, kind],
  );

  const applyCapture = useCallback((raw: RawSourceCapture) => {
    const detected = classifySourceKind(raw);
    setCapture(raw);
    setKind(detected);
    setMediaIndex(defaultMediaIndex(raw, detected));
  }, []);

  const runCapture = useCallback(
    async (request: SourceCaptureRequest, signal?: AbortSignal) => {
      setStatus('capturing');
      setError(null);
      setNotice(null);
      setDeletedSourceId(null);
      try {
        const raw = await backgroundAction<RawSourceCapture>({
          capture: request,
          event: 'importedSourceCapture',
        });
        if (!signal?.aborted) {
          applyCapture(raw);
        }
      } catch (failure) {
        if (!signal?.aborted) {
          setCapture(null);
          setError(messageOf(failure, 'Could not capture this page.'));
        }
      } finally {
        if (!signal?.aborted) {
          setStatus('idle');
        }
      }
    },
    [applyCapture],
  );

  // A new workspace brand never keeps another brand's draft or list.
  useEffect(() => {
    setCapture(null);
    setError(null);
    setNotice(null);
    setDeletedSourceId(null);
    setSources([]);
    setMedia({});
    if (brandId) {
      void chrome.runtime.sendMessage({ brandId, event: 'captureSetBrand' });
    }
  }, [brandId]);

  useEffect(() => {
    if (!initialCapture) {
      return;
    }
    const controller = new AbortController();
    void runCapture(initialCapture, controller.signal);
    return () => controller.abort();
  }, [initialCapture, runCapture]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey reloads the list after a save elsewhere.
  useEffect(() => {
    if (!brandId) {
      return;
    }
    const controller = new AbortController();
    backgroundAction<ImportedSourceView[]>({
      brandId,
      event: 'importedSourceList',
    })
      .then((next) => {
        if (!controller.signal.aborted && isActiveBrand(brandId)) {
          setSources(next);
        }
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(messageOf(failure, 'Could not load Imported sources.'));
        }
      });
    return () => controller.abort();
  }, [brandId, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    function handleMessage(message: { type?: string }) {
      if (
        !controller.signal.aborted &&
        message.type === IMPORTED_SOURCES_CHANGED
      ) {
        setRefreshKey((current) => current + 1);
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      controller.abort();
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Learn the media state of each listed source once, without starting a copy.
  useEffect(() => {
    if (!brandId) {
      return;
    }
    const controller = new AbortController();
    const pending = sources
      .filter(
        (source) =>
          source.snapshot.selectedMedia &&
          canPrepareMedia(source.snapshot.selectedMedia.availability),
      )
      .slice(0, MAX_OBSERVED_SOURCES);
    void (async () => {
      for (const source of pending) {
        if (controller.signal.aborted) {
          return;
        }
        try {
          const view = await backgroundAction<ImportedSourceMediaView>({
            brandId,
            event: 'importedSourceMediaObserve',
            sourceId: source.id,
          });
          if (!controller.signal.aborted && isActiveBrand(brandId)) {
            setMedia((current) => ({ ...current, [source.id]: view }));
          }
        } catch {
          // A failed status read is not a failed copy; the row stays actionable.
        }
      }
    })();
    return () => controller.abort();
  }, [brandId, sources]);

  const processingKey = Object.values(media)
    .filter((view) => view.state === 'processing')
    .map((view) => view.sourceId)
    .join(',');
  useEffect(() => {
    if (!brandId || !processingKey) {
      return;
    }
    const controller = new AbortController();
    const timer = setInterval(() => {
      for (const sourceId of processingKey.split(',')) {
        backgroundAction<ImportedSourceMediaView>({
          brandId,
          event: 'importedSourceMediaObserve',
          sourceId,
        })
          .then((view) => {
            if (!controller.signal.aborted && isActiveBrand(brandId)) {
              setMedia((current) => ({ ...current, [sourceId]: view }));
            }
          })
          .catch(() => undefined);
      }
    }, MEDIA_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [brandId, processingKey]);

  async function save() {
    const requestBrandId = brandId;
    if (!capture || !requestBrandId) {
      setError('Select a brand before saving this source.');
      return;
    }
    setStatus('saving');
    setError(null);
    setNotice(null);
    setDeletedSourceId(null);
    try {
      const result = await backgroundAction<SourceSaveResult>({
        brandId: requestBrandId,
        event: 'importedSourceSave',
        kind,
        mediaIndex,
        raw: capture,
      });
      if (!isActiveBrand(requestBrandId)) {
        return;
      }
      setNotice(
        result.deduplicated
          ? 'Already saved for this brand. Nothing was changed or generated.'
          : 'Saved for later. Nothing was generated, and brand Knowledge was not changed.',
      );
      setCapture(null);
      setRefreshKey((current) => current + 1);
    } catch (failure) {
      if (!isActiveBrand(requestBrandId)) {
        return;
      }
      if (
        failure instanceof BackgroundActionError &&
        failure.code === 'IMPORTED_SOURCE_DELETED' &&
        failure.deletedSourceId
      ) {
        setDeletedSourceId(failure.deletedSourceId);
      }
      setError(messageOf(failure, 'Could not save this source.'));
    } finally {
      setStatus('idle');
    }
  }

  async function saveAgain() {
    const requestBrandId = brandId;
    if (!requestBrandId || !deletedSourceId) {
      return;
    }
    setStatus('saving');
    setError(null);
    try {
      await backgroundAction<SourceSaveResult>({
        brandId: requestBrandId,
        event: 'importedSourceRecapture',
        sourceId: deletedSourceId,
      });
      if (!isActiveBrand(requestBrandId)) {
        return;
      }
      setDeletedSourceId(null);
      setCapture(null);
      setNotice('Saved again. Nothing was generated.');
      setRefreshKey((current) => current + 1);
    } catch (failure) {
      setError(messageOf(failure, 'Could not save this source again.'));
    } finally {
      setStatus('idle');
    }
  }

  async function mediaAction(
    source: ImportedSourceView,
    message: Record<string, unknown>,
    fallback: string,
  ) {
    const requestBrandId = brandId;
    if (!requestBrandId) {
      setError('Select a brand before preparing media.');
      return;
    }
    setBusyIds((current) => new Set(current).add(source.id));
    setError(null);
    try {
      const view = await backgroundAction<ImportedSourceMediaView>({
        brandId: requestBrandId,
        sourceId: source.id,
        ...message,
      });
      if (isActiveBrand(requestBrandId)) {
        setMedia((current) => ({ ...current, [source.id]: view }));
      }
    } catch (failure) {
      setError(messageOf(failure, fallback));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(source.id);
        return next;
      });
    }
  }

  const isBusy = status !== 'idle';

  return (
    <div className="h-full space-y-4 overflow-y-auto p-3">
      <h2 className="text-sm font-semibold">Imported sources</h2>
      <p className="text-xs text-muted-foreground">
        Save a post, page, image, video or podcast for this brand. Saving keeps
        the original and where it came from. It does not add brand Knowledge or
        start generation.
      </p>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      <div className="space-y-1">
        <p className="text-xs font-medium">Brand</p>
        <BrandSelector />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          isDisabled={!brandId || isBusy}
          onClick={() => {
            void runCapture({ scope: 'page' });
          }}
          type="button"
        >
          {status === 'capturing' ? 'Capturing…' : 'Capture this page'}
        </Button>
        <Button
          isDisabled={!brandId || isBusy}
          onClick={() => {
            void runCapture({ scope: 'selection' });
          }}
          type="button"
          variant={ButtonVariant.SECONDARY}
        >
          Capture selection
        </Button>
      </div>
      {deletedSourceId ? (
        <Button
          isDisabled={isBusy}
          onClick={() => {
            void saveAgain();
          }}
          type="button"
          variant={ButtonVariant.SECONDARY}
        >
          Save it again
        </Button>
      ) : null}
      {capture && preview ? (
        <SourceCaptureCard
          isBusy={isBusy}
          kind={kind}
          mediaIndex={mediaIndex}
          onAddToKnowledge={() =>
            onAddToKnowledge({
              mode:
                preview.basis === 'metadata_only'
                  ? 'link'
                  : preview.basis === 'visible_selection'
                    ? 'selection'
                    : 'page',
              text: capture.text,
              title: preview.title,
              url: capture.canonicalUrl ?? capture.url,
            })
          }
          onDiscard={() => setCapture(null)}
          onKindChange={(next) => {
            setKind(next);
            setMediaIndex(defaultMediaIndex(capture, next));
          }}
          onMediaChange={setMediaIndex}
          onSave={() => {
            void save();
          }}
          preview={preview}
        />
      ) : null}
      <section aria-label="Saved sources" className="space-y-2">
        <h3 className="text-sm font-medium">Saved sources</h3>
        {sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sources you save for this brand will appear here.
          </p>
        ) : (
          sources.map((source) => (
            <ImportedSourceCard
              isBusy={busyIds.has(source.id)}
              key={source.id}
              media={media[source.id]}
              onAddToKnowledge={(item) =>
                onAddToKnowledge(knowledgeHandoffFor(item))
              }
              onCheckMedia={(item) => {
                void mediaAction(
                  item,
                  { event: 'importedSourceMediaObserve' },
                  'Could not check this media.',
                );
              }}
              onOpenOriginal={openUrl}
              onPrepareMedia={(item) => {
                void mediaAction(
                  item,
                  { event: 'importedSourceMediaStart' },
                  'Could not prepare this media.',
                );
              }}
              onRetryMedia={(item, view) => {
                void mediaAction(
                  item,
                  {
                    event: 'importedSourceMediaRetry',
                    expectedIngestRevision: view.ingestRevision,
                  },
                  'Could not retry this media.',
                );
              }}
              onUseReference={onUseReference}
              source={source}
            />
          ))
        )}
      </section>
    </div>
  );
}
