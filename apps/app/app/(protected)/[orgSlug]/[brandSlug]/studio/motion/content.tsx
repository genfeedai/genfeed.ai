'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
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
import { useFeatureFlagContext } from '@genfeedai/hooks/feature-flags/provider';
import type { MotionSettingKey } from '@genfeedai/props/studio/motion-composer.props';
import type {
  MotionPreset,
  MotionPresetId,
} from '@genfeedai/props/studio/motion-presets.props';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useVisualProjects } from '@hooks/data/content/use-visual-projects';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { VisualCodeQuoteReview } from '@props/studio/visual-code.props';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import OrganizationModulePreferenceGate from '@ui/guards/organization-module/OrganizationModulePreferenceGate';
import Container from '@ui/layout/container/Container';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Textarea } from '@ui/primitives/textarea';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { SlidersHorizontal } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import MotionAdvancedSettings from './components/MotionAdvancedSettings';
import MotionPresetPanel from './components/MotionPresetPanel';
import MotionQuoteReview from './components/MotionQuoteReview';

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
  const { flags: platformFlags } = useFeatureFlagContext();
  const modulePreferences = resolveOrganizationModulePreferences(
    settingsLoading ? null : organizationSettings,
    platformFlags,
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
  const [appliedPresetId, setAppliedPresetId] = useState<MotionPresetId>();
  const composeRef = useRef<HTMLElement | null>(null);
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
  /** Fills the compose form only; the creator still requests and confirms a quote. */
  function applyPreset(preset: MotionPreset) {
    invalidateQuote();
    setMode('prompt');
    setLabel(t(`presets.items.${preset.id}.title`));
    setText(preset.prompt);
    setSettings({
      ...VISUAL_CODE_DEFAULT_SETTINGS,
      durationFrames: preset.durationFrames,
      height: preset.height,
      width: preset.width,
    });
    setPropsText('{}');
    setFormats(['mp4']);
    setFrames('0');
    setAppliedPresetId(preset.id);
    composeRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    });
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
  const isQuoteBlocked = isBusy || isActive || !catalog?.isAvailable;
  const modeOptions = [
    { label: t('prompt'), value: 'prompt' },
    { label: t('source'), value: 'sourceCode' },
    ...(project ? [{ label: t('props'), value: 'props' }] : []),
  ];
  const modelOptions = [
    { label: t('organizationDefault'), value: 'default' },
    ...catalogModels.map((model) => ({
      isDisabled: !model.isAvailable,
      label: `${model.label}${model.isByok ? ' · BYOK' : ''}`,
      value: model.key,
    })),
  ];
  const libraryAssets = (api.library.data ?? [])
    .filter((item) =>
      ['image', 'video', 'audio', 'music', 'voice'].includes(
        String(item.category),
      ),
    )
    .map((item) => ({
      id: item.id,
      label:
        typeof item.metadata === 'object'
          ? (item.metadata?.label ?? item.id)
          : item.id,
    }));
  const inheritedOutputs = current?.outputRequests
    .map(
      (item) =>
        `${item.format}${item.frame === undefined ? '' : ` @${item.frame}`}`,
    )
    .join(', ');
  function updateLabel(value: string) {
    invalidateQuote();
    setLabel(value);
  }
  function updateText(value: string) {
    invalidateQuote();
    setText(value);
  }
  function updateMode(value: string) {
    invalidateQuote();
    setMode(value as typeof mode);
  }
  function updateModel(value: string) {
    invalidateQuote();
    setModelKey(value);
  }
  function updateSetting(key: MotionSettingKey, value: number) {
    invalidateQuote();
    setSettings((prior) => ({ ...prior, [key]: value }));
  }
  function updatePropsText(value: string) {
    invalidateQuote();
    setPropsText(value);
  }
  function updateFrames(value: string) {
    invalidateQuote();
    setFrames(value);
  }
  function toggleAsset(assetId: string, isChecked: boolean) {
    invalidateQuote();
    setAssetIds((prior) =>
      isChecked ? [...prior, assetId] : prior.filter((id) => id !== assetId),
    );
  }
  function toggleFormat(format: string, isChecked: boolean) {
    invalidateQuote();
    setFormats((prior) =>
      isChecked
        ? [...prior, format]
        : prior.filter((value) => value !== format),
    );
  }
  function submitFromEditor() {
    if (!isQuoteBlocked) void requestQuote(project ? 'revise' : 'create');
  }
  const noticeContent =
    uiError || (catalog && !catalog.isAvailable) ? (
      <div className="grid gap-3 text-sm">
        {catalog && !catalog.isAvailable && (
          <p role="status">
            {t('unavailable')} {catalog.unavailableReason}
          </p>
        )}
        {uiError && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 text-destructive"
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
      </div>
    ) : null;
  const composerBanner =
    noticeContent || review ? (
      <div className="grid gap-4 p-3.5">
        {noticeContent}
        {review && (
          <MotionQuoteReview
            isAcknowledged={isAcknowledged}
            isBusy={isBusy}
            isVisionUnverified={
              catalogModels.find((model) => model.key === review.quote.modelKey)
                ?.inspectionCapability === 'unknown'
            }
            onAcknowledgedChange={setIsAcknowledged}
            onConfirm={() => void submit()}
            review={review}
          />
        )}
      </div>
    ) : undefined;
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
          {isModuleWorkEnabled ? null : noticeContent}
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
            {!projectId && !project && (
              <MotionPresetPanel
                appliedPresetId={appliedPresetId}
                isFirstRun={
                  !api.projects.isLoading &&
                  !api.projects.data?.pages.some(
                    (page) => page.projects.length > 0,
                  )
                }
                onApply={applyPreset}
              />
            )}
            <PromptBarContainer
              containerRef={(node) => {
                composeRef.current = node;
              }}
              layoutMode="inflow"
              maxWidth="full"
            >
              <PromptBarComposer
                aria-label={t('compose')}
                banner={composerBanner}
                beforeBody={
                  <div className="grid gap-2 px-3.5 pt-3">
                    <p className="gen-label">
                      {project ? t('revise') : t('compose')}
                    </p>
                    {!project && (
                      <Input
                        aria-label={t('label')}
                        className="h-7 border-0 bg-transparent px-0 shadow-none"
                        maxLength={120}
                        onChange={(event) => updateLabel(event.target.value)}
                        placeholder={t('label')}
                        value={label}
                      />
                    )}
                  </div>
                }
                data-testid="motion-prompt-bar"
                density="compact"
                role="group"
              >
                {mode === 'prompt' ? (
                  <PromptEditor
                    ariaLabel={t('prompt')}
                    className="min-h-12"
                    onSubmit={submitFromEditor}
                    onValueChange={updateText}
                    placeholder={t('prompt')}
                    value={text}
                  />
                ) : (
                  <Textarea
                    aria-label={mode === 'props' ? t('props') : t('source')}
                    className="border-0 bg-transparent px-0 font-mono text-xs shadow-none"
                    onChange={(event) => updateText(event.target.value)}
                    rows={mode === 'sourceCode' ? 12 : 6}
                    value={text}
                  />
                )}
                {mode === 'sourceCode' && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t('sourceHint')}
                  </p>
                )}
                {!project &&
                  selectedModel?.inspectionCapability === 'unknown' && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {t('unverifiedVision')}
                    </p>
                  )}
                <PromptBarToolbar
                  density="compact"
                  leading={
                    <>
                      <PromptBarCompactSelect
                        ariaLabel={t('inputMode')}
                        density="compact"
                        onChange={updateMode}
                        options={modeOptions}
                        value={mode}
                      />
                      {!project && (
                        <PromptBarCompactSelect
                          ariaLabel={t('model')}
                          density="compact"
                          onChange={updateModel}
                          options={modelOptions}
                          value={modelKey}
                        />
                      )}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            ariaLabel={t('settings')}
                            icon={<SlidersHorizontal className="size-4" />}
                            size={ButtonSize.ICON}
                            tooltip={t('settings')}
                            tooltipPosition="top"
                            variant={ButtonVariant.GHOST}
                            withWrapper={false}
                          />
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="max-h-[min(560px,var(--radix-popover-content-available-height,70vh))] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto"
                          collisionPadding={16}
                          side="top"
                          sideOffset={8}
                        >
                          <MotionAdvancedSettings
                            assetIds={assetIds}
                            formats={formats}
                            frames={frames}
                            inheritedOutputs={inheritedOutputs}
                            isProject={Boolean(project)}
                            libraryAssets={libraryAssets}
                            onAssetToggle={toggleAsset}
                            onFormatToggle={toggleFormat}
                            onFramesChange={updateFrames}
                            onPropsTextChange={updatePropsText}
                            onSettingChange={updateSetting}
                            propsText={propsText}
                            settings={settings}
                          />
                        </PopoverContent>
                      </Popover>
                    </>
                  }
                  trailing={
                    <>
                      {revision?.hasSource && (
                        <Button
                          isDisabled={isQuoteBlocked}
                          label={t('quoteExport')}
                          onClick={() => void requestQuote('export')}
                          size={ButtonSize.SM}
                          textTransform="none"
                          variant={ButtonVariant.GHOST}
                        />
                      )}
                      {revision?.hasSource &&
                        ['failed', 'cancelled'].includes(revision.status) && (
                          <Button
                            isDisabled={isQuoteBlocked}
                            label={t('quoteRetry')}
                            onClick={() => void requestQuote('retry')}
                            size={ButtonSize.SM}
                            textTransform="none"
                            variant={ButtonVariant.GHOST}
                          />
                        )}
                      <PromptBarSendButton
                        ariaLabel={t('getQuote')}
                        density="compact"
                        isDisabled={isQuoteBlocked}
                        onClick={submitFromEditor}
                        tooltip={t('getQuote')}
                      />
                    </>
                  }
                />
              </PromptBarComposer>
            </PromptBarContainer>
          </OrganizationModulePreferenceGate>
        </main>
      </div>
    </Container>
  );
}
