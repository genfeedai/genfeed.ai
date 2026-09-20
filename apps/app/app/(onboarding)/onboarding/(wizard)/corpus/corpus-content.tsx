'use client';

import CorpusSourceList from '@app/(onboarding)/onboarding/(wizard)/_expert/corpus-source-list';
import ExpertStepActions from '@app/(onboarding)/onboarding/(wizard)/_expert/expert-step-actions';
import ExpertStepHeader from '@app/(onboarding)/onboarding/(wizard)/_expert/expert-step-header';
import { useOnboarding } from '@contexts/onboarding/onboarding-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { CorpusSourceView } from '@props/onboarding/expert-path.props';
import { KnowledgeSourcesService } from '@services/content/knowledge-sources.service';
import { logger } from '@services/core/logger.service';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';

const POLL_INTERVAL_MS = 3_000;
const SOURCE_LIST_LIMIT = 50;
const FILE_ACCEPT = '.pdf,.docx,.txt,.md,.markdown';

const MODES = ['url', 'text', 'file'] as const;

type CorpusMode = (typeof MODES)[number];
type CorpusErrorKey = 'add' | 'load' | 'retry';

const PENDING_STATES: readonly string[] = [
  KnowledgeProcessingState.QUEUED,
  KnowledgeProcessingState.PROCESSING,
];

/**
 * Stable capture identity so re-submitting the same material reuses the
 * existing source instead of duplicating it.
 */
function buildIdempotencyKey(brandId: string, payload: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index++) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `expert-corpus-${brandId}-${hash.toString(16)}`;
}

export default function CorpusContent() {
  const translate = useTranslations('pages.onboarding.expert');
  const { handleSkip, handleStepComplete, saving } = useOnboarding();
  const { selectedBrand } = useBrand();
  const brandId = selectedBrand?.id ?? null;

  const getKnowledgeService = useAuthedService((token: string) =>
    KnowledgeSourcesService.getInstance(token),
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<CorpusMode>('url');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sources, setSources] = useState<CorpusSourceView[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const [retryingSourceId, setRetryingSourceId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<CorpusErrorKey | null>(null);

  // Load corpus sources and their current ingestion state; poll while any
  // source is still queued or processing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshTick is an intentional re-fire signal for the abortable poll
  useEffect(() => {
    if (!brandId) {
      return;
    }
    const controller = new AbortController();
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const service = await getKnowledgeService();
        const all = await service.findForBrand(
          { brandId, limit: SOURCE_LIST_LIMIT, page: 1 },
          controller.signal,
        );
        const corpus = all.filter(
          (source) => source.purpose === KnowledgeSourcePurpose.BRAND_TRUTH,
        );
        const views = await Promise.all(
          corpus.map(async (source) => {
            const versions = await service.findVersions(
              source.id,
              brandId,
              controller.signal,
            );
            return {
              id: source.id,
              title: source.title,
              version:
                versions.find((version) => version.isCurrent) ?? versions[0],
            };
          }),
        );
        if (controller.signal.aborted) {
          return;
        }
        setSources(views);
        if (
          views.some((view) =>
            PENDING_STATES.includes(view.version?.processingState ?? ''),
          )
        ) {
          pollTimer = setTimeout(
            () => setRefreshTick((tick) => tick + 1),
            POLL_INTERVAL_MS,
          );
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to load corpus sources', error);
        setErrorKey('load');
      }
    };

    void load();
    return () => {
      controller.abort();
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [brandId, getKnowledgeService, refreshTick]);

  const canAdd =
    (mode === 'url' && url.trim().length > 0) ||
    (mode === 'text' && text.trim().length > 0 && title.trim().length > 0) ||
    (mode === 'file' && file !== null);

  const handleAdd = useCallback(async () => {
    if (!brandId || !canAdd) {
      return;
    }
    setIsAdding(true);
    setErrorKey(null);
    try {
      const service = await getKnowledgeService();
      if (mode === 'file' && file) {
        await service.upload(
          file,
          {
            purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
            scope: KnowledgeMemoryScope.BRAND,
            ...(title.trim() ? { title: title.trim() } : {}),
          },
          brandId,
          buildIdempotencyKey(
            brandId,
            `file:${file.name}:${file.size}:${file.lastModified}`,
          ),
        );
        setFile(null);
      } else if (mode === 'url') {
        const referenceUrl = url.trim().includes('://')
          ? url.trim()
          : `https://${url.trim()}`;
        await service.capture(
          {
            kind: KnowledgeSourceKind.URL,
            purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
            referenceUrl,
            scope: KnowledgeMemoryScope.BRAND,
            title: title.trim() || referenceUrl,
          },
          brandId,
          buildIdempotencyKey(brandId, `url:${referenceUrl}`),
        );
        setUrl('');
      } else {
        await service.capture(
          {
            kind: KnowledgeSourceKind.TEXT,
            purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
            scope: KnowledgeMemoryScope.BRAND,
            text: text.trim(),
            title: title.trim(),
          },
          brandId,
          buildIdempotencyKey(brandId, `text:${title.trim()}:${text.trim()}`),
        );
        setText('');
      }
      setTitle('');
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      logger.error('Failed to add corpus source', error);
      setErrorKey('add');
    } finally {
      setIsAdding(false);
    }
  }, [brandId, canAdd, file, getKnowledgeService, mode, text, title, url]);

  const handleRetry = useCallback(
    async (sourceId: string) => {
      if (!brandId) {
        return;
      }
      setRetryingSourceId(sourceId);
      setErrorKey(null);
      try {
        await (await getKnowledgeService()).retry(sourceId, brandId);
        setRefreshTick((tick) => tick + 1);
      } catch (error) {
        logger.error('Failed to retry corpus source', error);
        setErrorKey('retry');
      } finally {
        setRetryingSourceId(null);
      }
    },
    [brandId, getKnowledgeService],
  );

  const hasReadySource = sources.some(
    (source) =>
      source.version?.processingState === KnowledgeProcessingState.READY,
  );

  const handleContinue = useCallback(async () => {
    captureAnalyticsEvent(ANALYTICS_EVENTS.EXPERT_ONBOARDING_STEP, {
      action: 'completed',
      step: 'corpus',
    });
    await handleStepComplete('corpus');
  }, [handleStepComplete]);

  const handleSkipStep = useCallback(async () => {
    captureAnalyticsEvent(ANALYTICS_EVENTS.EXPERT_ONBOARDING_STEP, {
      action: 'skipped',
      step: 'corpus',
    });
    await handleSkip('corpus');
  }, [handleSkip]);

  return (
    <div className="space-y-8">
      <ExpertStepHeader
        title={translate('corpus.title')}
        description={translate('corpus.description')}
      />

      <div className="max-w-2xl space-y-4">
        <div className="flex flex-wrap gap-2">
          {MODES.map((option) => (
            <Button
              key={option}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              aria-pressed={mode === option}
              label={translate(`corpus.modes.${option}`)}
              onClick={() => setMode(option)}
              className={`h-9 border px-3 text-xs font-medium transition ${
                mode === option
                  ? 'border-border-strong bg-hover text-foreground'
                  : 'border-border bg-background-tertiary text-muted-foreground hover:border-border-strong hover:text-foreground'
              }`}
            />
          ))}
        </div>

        {mode === 'url' ? (
          <Input
            aria-label={translate('corpus.urlLabel')}
            type="url"
            value={url}
            placeholder={translate('corpus.urlPlaceholder')}
            onChange={(event) => setUrl(event.target.value)}
          />
        ) : null}

        {mode === 'text' ? (
          <Textarea
            aria-label={translate('corpus.textLabel')}
            rows={6}
            value={text}
            placeholder={translate('corpus.textPlaceholder')}
            onChange={(event) => setText(event.target.value)}
          />
        ) : null}

        {mode === 'file' ? (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              hidden
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.DEFAULT}
                label={file?.name ?? translate('corpus.chooseFile')}
                icon={<Upload className="size-4" />}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-none"
              />
              <span className="text-xs text-muted-foreground">
                {translate('corpus.fileHint')}
              </span>
            </div>
          </div>
        ) : null}

        <Input
          aria-label={translate('corpus.titleLabel')}
          value={title}
          placeholder={translate('corpus.titlePlaceholder')}
          onChange={(event) => setTitle(event.target.value)}
        />

        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.DEFAULT}
          label={translate('corpus.add')}
          isDisabled={!canAdd}
          isLoading={isAdding}
          onClick={handleAdd}
          className="rounded-none px-5"
        />
      </div>

      <div className="max-w-2xl">
        <CorpusSourceList
          retryingSourceId={retryingSourceId}
          sources={sources}
          onRetry={handleRetry}
        />
      </div>

      {errorKey ? (
        <div className="max-w-2xl">
          <Alert type={AlertCategory.ERROR}>
            <div className="space-y-1">
              <div className="font-medium">
                {translate('common.errorTitle')}
              </div>
              <div className="text-xs text-foreground/70">
                {translate(`corpus.errors.${errorKey}`)}
              </div>
            </div>
          </Alert>
        </div>
      ) : null}

      <ExpertStepActions
        isContinueDisabled={!hasReadySource}
        isSubmitting={saving}
        onContinue={handleContinue}
        onSkip={handleSkipStep}
      />
    </div>
  );
}
