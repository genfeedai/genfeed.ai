'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  resolveOrganizationModulePreferences,
  VISUAL_CODE_DEFAULT_SETTINGS,
} from '@genfeedai/contracts/constants';
import type {
  IVisualCodeOutputRequest,
  IVisualCodeSettings,
  IVisualRevision,
  VisualCodeJson,
  VisualCodeQuoteRequest,
} from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useVisualProjects } from '@hooks/data/content/use-visual-projects';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { VisualCodeQuoteReview } from '@props/studio/visual-code.props';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

export default function MotionContent() {
  const { orgId, userId, sessionId } = useAuthIdentity();
  const selectedProject = useSearchParams().get('project');
  const { selectedBrand } = useBrand();
  return (
    <MotionWorkspace
      key={JSON.stringify([
        orgId,
        userId,
        sessionId,
        selectedBrand?.id,
        selectedProject,
      ])}
    />
  );
}
function MotionWorkspace() {
  const t = useTranslations('pages.studioMotion');
  const quoteEpoch = useRef(0);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      quoteEpoch.current++;
    };
  }, []);
  const {
    organizationId,
    selectedBrand,
    settings: organizationSettings,
    settingsLoading,
  } = useBrand();
  const modulePreferences = resolveOrganizationModulePreferences(
    settingsLoading ? null : organizationSettings,
  );
  const isModuleWorkEnabled = Boolean(
    organizationId && modulePreferences?.motion === true,
  );
  const { href } = useOrgUrl();
  const router = useRouter();
  const search = useSearchParams();
  const projectId = search.get('project') ?? undefined;
  const api = useVisualProjects({ brandId: selectedBrand?.id, projectId });
  const [mode, setMode] = useState<'prompt' | 'sourceCode' | 'props'>('prompt');
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [modelKey, setModelKey] = useState('default');
  const [settings, setSettings] = useState<IVisualCodeSettings>(
    VISUAL_CODE_DEFAULT_SETTINGS,
  );
  const [propsText, setPropsText] = useState('{}');
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [formats, setFormats] = useState<string[]>(['mp4']);
  const [frames, setFrames] = useState('0');
  const [review, setReview] = useState<VisualCodeQuoteReview | null>(null);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStaleRevision, setIsStaleRevision] = useState(false);
  const [older, setOlder] = useState<IVisualRevision[]>([]);
  const [historyCursor, setHistoryCursor] = useState<
    number | null | undefined
  >();
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    if (isModuleWorkEnabled) return;
    quoteEpoch.current++;
    setReview(null);
    setIsAcknowledged(false);
  }, [isModuleWorkEnabled]);
  const project = api.project.data;
  const revisions = [...(project?.revisions ?? []), ...older];
  const revision =
    revisions.find((item) => item.number === selectedRevision) ?? revisions[0];
  const current = project?.revisions[0];
  const isActive = Boolean(
    current && !['completed', 'failed', 'cancelled'].includes(current.status),
  );
  const catalog = api.catalog.data;
  const catalogModels = catalog?.models ?? [];
  const selectedModel = catalogModels.find(
    (item) =>
      item.key ===
      (modelKey === 'default' ? catalog?.defaultModelKey : modelKey),
  );
  function invalidateQuote() {
    quoteEpoch.current++;
    setReview(null);
    setIsAcknowledged(false);
  }
  function outputs(): IVisualCodeOutputRequest[] {
    const result: IVisualCodeOutputRequest[] = [];
    for (const format of formats) {
      if (format === 'mp4') result.push({ format });
      else
        for (const raw of frames.split(',')) {
          const frame = Number(raw.trim());
          if (!raw.trim() || !Number.isInteger(frame))
            throw new Error(t('invalidFrames'));
          result.push({ format: format as 'png' | 'jpeg', frame });
        }
    }
    if (!result.length || result.length > 8) throw new Error(t('outputLimit'));
    return result;
  }
  function parsedProps(): Record<string, VisualCodeJson> {
    const value: unknown = JSON.parse(
      mode === 'props' && project ? text : propsText,
    );
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(t('invalidProps'));
    return value as Record<string, VisualCodeJson>;
  }
  function reloadLatestRevision() {
    setError(null);
    setIsStaleRevision(false);
    setSelectedRevision(null);
    setOlder([]);
    if (projectId) {
      void api.project.refetch();
    }
  }
  async function run(task: () => Promise<void>) {
    setIsBusy(true);
    setError(null);
    setIsStaleRevision(false);
    try {
      await task();
    } catch (cause) {
      const isStale =
        getJsonApiErrorMember(cause)?.detail === 'stale_visual_revision';
      setIsStaleRevision(isStale);
      setError(
        isStale
          ? t('staleRevision')
          : cause instanceof Error
            ? cause.message
            : t('failed'),
      );
    } finally {
      setIsBusy(false);
    }
  }
  async function requestQuote(
    operation: 'create' | 'revise' | 'export' | 'retry',
  ) {
    if (!isModuleWorkEnabled) return;
    const epoch = ++quoteEpoch.current;
    await run(async () => {
      if (!selectedBrand?.id) throw new Error(t('selectBrand'));
      const requestId = crypto.randomUUID();
      let request: VisualCodeQuoteRequest;
      if (operation === 'create')
        request = {
          operation,
          input: {
            brandId: selectedBrand.id,
            requestId,
            label,
            ...(mode === 'sourceCode'
              ? { sourceCode: text }
              : { prompt: text }),
            ...(modelKey === 'default' ? {} : { modelKey }),
            settings,
            props: parsedProps(),
            sourceAssetIds: assetIds,
            outputs: outputs(),
          },
        };
      else {
        if (!project || !revision) throw new Error(t('selectProject'));
        const base = { requestId, expectedRevision: project.currentRevision };
        if (operation === 'revise')
          request = {
            operation,
            projectId: project.id,
            input: {
              ...base,
              ...(mode === 'props'
                ? { props: parsedProps() }
                : mode === 'sourceCode'
                  ? { sourceCode: text }
                  : { prompt: text }),
            },
          };
        else if (operation === 'export')
          request = {
            operation,
            projectId: project.id,
            input: { ...base, revision: revision.number, outputs: outputs() },
          };
        else
          request = {
            operation,
            projectId: project.id,
            input: { ...base, revision: revision.number },
          };
      }
      const quote = await api.quote(request);
      if (!isMounted.current || epoch !== quoteEpoch.current) return;
      setReview({ request, quote });
      setIsAcknowledged(false);
    });
  }
  async function submit() {
    if (!isModuleWorkEnabled || !review || !isAcknowledged) return;
    await run(async () => {
      const result = await api.submit(
        review.request,
        review.quote.maximumCredits,
      );
      if (!isMounted.current) return;
      invalidateQuote();
      setText('');
      router.replace(
        `${href(APP_ROUTES.STUDIO.MOTION)}?project=${encodeURIComponent(result.id)}`,
      );
    });
  }
  const uiError =
    error ??
    (api.catalog.error ?? api.project.error ?? api.projects.error)?.message;
  return (
    <Container label={t('title')} titleVisibility="sr-only">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div>
            <h1 className="gen-heading-sm">{t('title')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('description')}
            </p>
          </div>
          {isModuleWorkEnabled && (
            <Button asChild variant={ButtonVariant.SECONDARY}>
              <Link href={href(APP_ROUTES.STUDIO.MOTION)}>
                {t('newProject')}
              </Link>
            </Button>
          )}
          <nav aria-label={t('projects')} className="flex flex-col gap-2">
            {api.projects.data?.pages
              .flatMap((page) => page.projects)
              .map((item) => (
                <Link
                  key={item.id}
                  aria-current={item.id === projectId ? 'page' : undefined}
                  className="rounded-lg border border-border p-3 text-sm hover:bg-muted"
                  href={`${href(APP_ROUTES.STUDIO.MOTION)}?project=${encodeURIComponent(item.id)}`}
                >
                  {item.label}
                </Link>
              ))}
            {api.projects.isLoading && <p role="status">{t('loading')}</p>}
            {api.projects.hasNextPage && (
              <Button
                variant={ButtonVariant.GHOST}
                onClick={() => void api.projects.fetchNextPage()}
              >
                {t('moreProjects')}
              </Button>
            )}
          </nav>
        </aside>
        <main className="min-w-0 space-y-6">
          {uiError && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive p-3 text-sm text-destructive"
            >
              <p>{uiError}</p>
              {isStaleRevision ? (
                <Button
                  variant={ButtonVariant.GHOST}
                  onClick={reloadLatestRevision}
                >
                  {t('reloadRevision')}
                </Button>
              ) : null}
            </div>
          )}
          {catalog && !catalog.isAvailable && (
            <p
              role="status"
              className="rounded-lg border border-border p-4 text-sm"
            >
              {t('unavailable')} {catalog.unavailableReason}
            </p>
          )}
          {project && (
            <section className="space-y-3" aria-label={t('history')}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="gen-heading-sm">{project.label}</h2>
                <span role="status" aria-live="polite" className="text-sm">
                  {current?.status} · {current?.progress ?? 0}%
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {revisions.map((item) => (
                  <Button
                    key={item.id}
                    variant={
                      revision?.id === item.id
                        ? ButtonVariant.DEFAULT
                        : ButtonVariant.SECONDARY
                    }
                    onClick={() => {
                      setSelectedRevision(item.number);
                      setSource(null);
                      invalidateQuote();
                    }}
                  >
                    {t('revision', { number: item.number })} · {item.status}
                  </Button>
                ))}
              </div>
              {(historyCursor === undefined
                ? project.nextRevisionCursor
                : historyCursor) != null && (
                <Button
                  variant={ButtonVariant.GHOST}
                  disabled={isBusy}
                  onClick={() =>
                    void run(async () => {
                      const cursor =
                        historyCursor === undefined
                          ? project.nextRevisionCursor
                          : historyCursor;
                      if (cursor === null || cursor === undefined) return;
                      const page = await api.history(cursor);
                      setOlder((prior) => [...prior, ...page.revisions]);
                      setHistoryCursor(page.nextRevisionCursor);
                    })
                  }
                >
                  {t('olderRevisions')}
                </Button>
              )}
              {revision && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {t('cost', {
                      consumed: revision.consumedCredits,
                      maximum: revision.maximumCredits,
                    })}{' '}
                    {t('rendererProvenance', {
                      model: revision.modelKey ?? '—',
                      version: revision.rendererVersion,
                    })}
                  </p>
                  {Array.from(new Set(revision.diagnostics ?? [])).map(
                    (message) => (
                      <p
                        key={message}
                        className="text-sm text-muted-foreground"
                      >
                        {message}
                      </p>
                    ),
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(revision.previews ?? []).map((media, index) => (
                      <Image
                        key={media.url}
                        unoptimized
                        src={media.url}
                        width={media.width}
                        height={media.height}
                        alt={t('preview', { number: index + 1 })}
                        className="h-auto w-full rounded-lg border border-border"
                      />
                    ))}
                  </div>
                  <div className="space-y-3">
                    {revision.outputs.map((media, index) => (
                      <div
                        key={media.ingredientId ?? media.url}
                        className="space-y-2"
                      >
                        {media.format === 'mp4' ? (
                          <VideoPlayer
                            config={{
                              controls: true,
                              muted: false,
                              loop: false,
                              playsInline: true,
                              preload: 'metadata',
                            }}
                            src={media.url}
                            className="max-h-96 w-full rounded-lg"
                            ariaLabel={t('videoOutput')}
                          />
                        ) : (
                          <Image
                            unoptimized
                            src={media.url}
                            width={media.width}
                            height={media.height}
                            alt={t('output', { number: index + 1 })}
                            className="h-auto max-h-96 w-auto rounded-lg"
                          />
                        )}
                        <Link
                          className="text-sm underline"
                          href={href(
                            `/library?ingredient=${encodeURIComponent(media.ingredientId ?? '')}`,
                          )}
                        >
                          {t('openLibrary')}
                        </Link>
                        <a
                          className="ml-4 text-sm underline"
                          href={media.url}
                          download
                        >
                          {t('download')}
                        </a>
                        {modulePreferences?.editor === true &&
                          media.format === 'mp4' &&
                          media.ingredientId && (
                            <Link
                              className="ml-4 text-sm underline"
                              href={href(
                                `${APP_ROUTES.STUDIO.EDITOR_NEW}?video=${encodeURIComponent(media.ingredientId)}`,
                              )}
                            >
                              {t('openEditor')}
                            </Link>
                          )}
                      </div>
                    ))}
                  </div>
                  {revision.hasSource && (
                    <Button
                      variant={ButtonVariant.SECONDARY}
                      disabled={isBusy}
                      onClick={() =>
                        void run(async () =>
                          setSource(await api.source(revision.number)),
                        )
                      }
                    >
                      {t('viewSource')}
                    </Button>
                  )}
                  {isModuleWorkEnabled && (
                    <div className="flex gap-2">
                      {revision.hasSource && (
                        <Button
                          variant={ButtonVariant.SECONDARY}
                          disabled={isBusy}
                          onClick={() =>
                            void run(async () => {
                              const value = await api.source(revision.number);
                              if (!isMounted.current) return;
                              invalidateQuote();
                              setMode('sourceCode');
                              setText(value);
                            })
                          }
                        >
                          {t('loadSource')}
                        </Button>
                      )}
                      <Button
                        variant={ButtonVariant.SECONDARY}
                        onClick={() => {
                          invalidateQuote();
                          setMode('props');
                          setText(JSON.stringify(revision.props, null, 2));
                        }}
                      >
                        {t('loadProps')}
                      </Button>
                    </div>
                  )}
                  {source !== null && (
                    <div className="space-y-2">
                      <Textarea
                        isReadOnly
                        aria-label={t('retainedSource')}
                        value={source}
                        rows={14}
                        className="font-mono text-xs"
                      />
                      <Button
                        variant={ButtonVariant.SECONDARY}
                        onClick={() => {
                          const url = URL.createObjectURL(
                            new Blob([source], { type: 'text/plain' }),
                          );
                          const anchor = document.createElement('a');
                          anchor.href = url;
                          anchor.download = `visual-revision-${revision.number}.tsx`;
                          anchor.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        {t('downloadSource')}
                      </Button>
                    </div>
                  )}
                  {isActive && (
                    <Button
                      disabled={isBusy}
                      variant={ButtonVariant.SECONDARY}
                      onClick={() => void run(api.cancel)}
                    >
                      {t('cancel')}
                    </Button>
                  )}
                </>
              )}
            </section>
          )}
          <OrganizationModulePreferenceGate moduleId="motion">
            <section
              className="space-y-4 rounded-xl border border-border p-5"
              aria-label={t('compose')}
              onChange={invalidateQuote}
            >
              <h2 className="gen-heading-sm">
                {project ? t('revise') : t('compose')}
              </h2>
              {!project && (
                <label className="grid gap-2 text-sm">
                  {t('label')}
                  <Input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    maxLength={120}
                  />
                </label>
              )}
              <label className="grid gap-2 text-sm">
                {t('inputMode')}
                <Select
                  value={mode}
                  onValueChange={(value) => {
                    setMode(value as typeof mode);
                    invalidateQuote();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prompt">{t('prompt')}</SelectItem>
                    <SelectItem value="sourceCode">{t('source')}</SelectItem>
                    {project && (
                      <SelectItem value="props">{t('props')}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2 text-sm">
                {mode === 'prompt'
                  ? t('prompt')
                  : mode === 'props'
                    ? t('props')
                    : t('source')}
                <Textarea
                  rows={mode === 'sourceCode' ? 12 : 5}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className={mode === 'prompt' ? '' : 'font-mono text-xs'}
                />
              </label>
              {mode === 'sourceCode' && (
                <p className="text-sm text-muted-foreground">
                  {t('sourceHint')}
                </p>
              )}
              {!project && (
                <>
                  <label className="grid gap-2 text-sm">
                    {t('model')}
                    <Select
                      value={modelKey}
                      onValueChange={(value) => {
                        setModelKey(value);
                        invalidateQuote();
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">
                          {t('organizationDefault')}
                        </SelectItem>
                        {catalogModels.map((model) => (
                          <SelectItem
                            key={model.key}
                            value={model.key}
                            disabled={!model.isAvailable}
                          >
                            {model.label}
                            {model.isByok ? ' · BYOK' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  {selectedModel?.inspectionCapability === 'unknown' && (
                    <p className="text-sm text-muted-foreground">
                      {t('unverifiedVision')}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {(
                      ['width', 'height', 'fps', 'durationFrames'] as const
                    ).map((key) => (
                      <label key={key} className="grid gap-2 text-sm">
                        {t(key)}
                        <Input
                          type="number"
                          value={settings[key]}
                          onChange={(event) =>
                            setSettings((prior) => ({
                              ...prior,
                              [key]: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="grid gap-2 text-sm">
                    {t('props')}
                    <Textarea
                      rows={3}
                      value={propsText}
                      onChange={(event) => setPropsText(event.target.value)}
                      className="font-mono text-xs"
                    />
                  </label>
                  <fieldset className="space-y-2">
                    <legend className="text-sm">{t('libraryAssets')}</legend>
                    <p className="text-xs text-muted-foreground">
                      {t('libraryHint')}
                    </p>
                    <div className="max-h-40 space-y-2 overflow-y-auto">
                      {api.library.data
                        ?.filter((item) =>
                          [
                            'image',
                            'video',
                            'audio',
                            'music',
                            'voice',
                          ].includes(String(item.category)),
                        )
                        .map((item) => (
                          <Checkbox
                            key={item.id}
                            checked={assetIds.includes(item.id)}
                            disabled={
                              !assetIds.includes(item.id) &&
                              assetIds.length >= 12
                            }
                            label={
                              typeof item.metadata === 'object'
                                ? (item.metadata?.label ?? item.id)
                                : item.id
                            }
                            onCheckedChange={(checked) => {
                              setAssetIds((prior) =>
                                checked === true
                                  ? [...prior, item.id]
                                  : prior.filter((id) => id !== item.id),
                              );
                              invalidateQuote();
                            }}
                          />
                        ))}
                    </div>
                  </fieldset>
                </>
              )}
              <fieldset className="space-y-3">
                <legend className="text-sm">
                  {project ? t('exportOutputs') : t('outputs')}
                </legend>
                {project && (
                  <p className="text-sm text-muted-foreground">
                    {t('inheritedOutputs')}{' '}
                    {current?.outputRequests
                      .map(
                        (item) =>
                          `${item.format}${item.frame === undefined ? '' : ` @${item.frame}`}`,
                      )
                      .join(', ')}
                  </p>
                )}
                <div className="flex gap-4">
                  {['mp4', 'png', 'jpeg'].map((format) => (
                    <label
                      key={format}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        aria-label={format.toUpperCase()}
                        checked={formats.includes(format)}
                        onCheckedChange={(checked) =>
                          setFormats((prior) =>
                            checked === true
                              ? [...prior, format]
                              : prior.filter((value) => value !== format),
                          )
                        }
                      />
                      {format.toUpperCase()}
                    </label>
                  ))}
                </div>
                {formats.some((format) => format !== 'mp4') && (
                  <label className="grid gap-2 text-sm">
                    {t('frames')}
                    <Input
                      value={frames}
                      onChange={(event) => setFrames(event.target.value)}
                    />
                  </label>
                )}
              </fieldset>
              <p className="text-xs text-muted-foreground">{t('limits')}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={isBusy || isActive || !catalog?.isAvailable}
                  onClick={() =>
                    void requestQuote(project ? 'revise' : 'create')
                  }
                >
                  {t('getQuote')}
                </Button>
                {revision?.hasSource && (
                  <Button
                    disabled={isBusy || isActive}
                    variant={ButtonVariant.SECONDARY}
                    onClick={() => void requestQuote('export')}
                  >
                    {t('quoteExport')}
                  </Button>
                )}
                {revision?.hasSource &&
                  ['failed', 'cancelled'].includes(revision.status) && (
                    <Button
                      disabled={isBusy || isActive}
                      variant={ButtonVariant.SECONDARY}
                      onClick={() => void requestQuote('retry')}
                    >
                      {t('quoteRetry')}
                    </Button>
                  )}
              </div>
            </section>
            {review && (
              <section
                className="space-y-3 rounded-xl border border-border p-5"
                aria-label={t('reviewQuote')}
              >
                <h2 className="gen-heading-sm">{t('reviewQuote')}</h2>
                <p className="text-sm">
                  {review.quote.modelKey}
                  {review.quote.isByok ? ' · BYOK' : ''} ·{' '}
                  {review.quote.settings.width}×{review.quote.settings.height} ·{' '}
                  {review.quote.outputRequests
                    .map(
                      (output) =>
                        `${output.format}${output.frame === undefined ? '' : ` @${output.frame}`}`,
                    )
                    .join(', ')}
                </p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt>{t('authoring')}</dt>
                  <dd>{review.quote.authoringCredits}</dd>
                  <dt>{t('inspection')}</dt>
                  <dd>{review.quote.inspectionCredits}</dd>
                  <dt>{t('rendering')}</dt>
                  <dd>{review.quote.renderCredits}</dd>
                  <dt>{t('maximum')}</dt>
                  <dd>{review.quote.maximumCredits}</dd>
                </dl>
                <p className="text-sm text-muted-foreground">
                  {t('billingHint')}
                </p>
                {catalogModels.find(
                  (model) => model.key === review.quote.modelKey,
                )?.inspectionCapability === 'unknown' && (
                  <p className="text-sm">{t('unverifiedVision')}</p>
                )}
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    aria-label={t('acknowledge', {
                      maximum: review.quote.maximumCredits,
                    })}
                    checked={isAcknowledged}
                    onCheckedChange={(checked) =>
                      setIsAcknowledged(checked === true)
                    }
                  />
                  {t('acknowledge', { maximum: review.quote.maximumCredits })}
                </label>
                <Button
                  disabled={!isAcknowledged || isBusy}
                  onClick={() => void submit()}
                >
                  {isBusy ? t('submitting') : t('confirm')}
                </Button>
              </section>
            )}
          </OrganizationModulePreferenceGate>
        </main>
      </div>
    </Container>
  );
}
