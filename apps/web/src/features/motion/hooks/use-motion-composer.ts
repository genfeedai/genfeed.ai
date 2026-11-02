'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAgentChatStore } from '@genfeedai/agent';
import {
  APP_ROUTES,
  resolveOrganizationModulePreferences,
  VISUAL_CODE_DEFAULT_SETTINGS,
} from '@genfeedai/contracts/constants';
import type {
  CreativeAppAgentContext,
  CreativeAppProjectReference,
  IVisualCodeOutputRequest,
  IVisualCodeSettings,
  IVisualRevision,
  VisualCodeJson,
  VisualCodeQuoteRequest,
} from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  MotionComposerMode,
  MotionSettingKey,
  UseMotionComposerOptions,
} from '@/features/motion/props/motion-composer.props';
import type { MotionPreset } from '@/features/motion/props/motion-presets.props';
import { useCreativeAppAgentContext } from '@/hooks/agent/use-creative-app-agent-context/use-creative-app-agent-context';
import { useVisualProjects } from '@/hooks/data/content/use-visual-projects';
import { useFeatureFlagContext } from '@/hooks/feature-flags/provider';
import { isProjectChangeRequest } from '@/lib/creative-apps/project-change-request';
import type { VisualCodeQuoteReview } from '@/props/studio/visual-code.props';

const SETTLED_STATUSES = ['completed', 'failed', 'cancelled'];

/**
 * Everything the Motion prompt bar and the open project share: the compose
 * form, the quote the creator must approve, the revision being viewed and the
 * visual-projects API. Nothing is submitted until a quote is requested and its
 * credit ceiling acknowledged; any change to the form discards the quote.
 *
 * `projectId` is the open project, or undefined while composing a new one.
 */
export function useMotionComposer({ projectId }: UseMotionComposerOptions) {
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
  const api = useVisualProjects({ brandId: selectedBrand?.id, projectId });
  const seedComposer = useAgentChatStore((state) => state.seedComposer);
  const loadedProjects = api.projects.data?.pages;
  const knownProjects = useMemo<CreativeAppProjectReference[] | null>(
    () =>
      loadedProjects
        ? loadedProjects.flatMap((page) =>
            page.projects.map((item) => ({
              id: item.id,
              title: item.label || t('newProject'),
            })),
          )
        : null,
    [loadedProjects, t],
  );
  const creativeApp = useMemo<CreativeAppAgentContext | null>(
    () =>
      knownProjects
        ? {
            app: 'motion',
            ...(projectId ? { openProjectId: projectId } : {}),
            projects: knownProjects,
          }
        : null,
    [knownProjects, projectId],
  );
  useCreativeAppAgentContext(creativeApp);
  const [projectChoice, setProjectChoice] = useState<string | null>(null);
  const [mode, setMode] = useState<MotionComposerMode>('prompt');
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
    current && !SETTLED_STATUSES.includes(current.status),
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
    { isNewProjectConfirmed = false }: { isNewProjectConfirmed?: boolean } = {},
  ) {
    if (!isModuleWorkEnabled) return;
    setProjectChoice(null);
    if (
      operation === 'create' &&
      !projectId &&
      !isNewProjectConfirmed &&
      knownProjects?.length &&
      isProjectChangeRequest(text)
    ) {
      setProjectChoice(text);
      return;
    }
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
  /** Starts the quoted work. A new project opens at its own page. */
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
      if (review.request.operation === 'create')
        router.push(
          `${href(APP_ROUTES.STUDIO.MOTION)}/${encodeURIComponent(result.id)}`,
        );
    });
  }
  const uiError =
    error ??
    (api.catalog.error ?? api.project.error ?? api.projects.error)?.message;
  // A change request is routed by the brand's project list, so the New screen
  // waits for it rather than quoting a new project for work that already exists.
  const isProjectListPending =
    !projectId && Boolean(api.projects.isLoading || api.projects.error);
  const isQuoteBlocked =
    isBusy || isActive || isProjectListPending || !catalog?.isAvailable;
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
  /** The viewer picked the project the request applies to. */
  function chooseProject(chosenProjectId: string) {
    if (projectChoice) seedComposer(projectChoice);
    router.push(
      `${href(APP_ROUTES.STUDIO.MOTION)}/${encodeURIComponent(chosenProjectId)}`,
    );
  }
  function createNewProject() {
    void requestQuote('create', { isNewProjectConfirmed: true });
  }
  function updateText(value: string) {
    setProjectChoice(null);
    invalidateQuote();
    setText(value);
  }
  function updateMode(value: string) {
    invalidateQuote();
    setMode(value as MotionComposerMode);
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
  function selectRevision(revisionId: string) {
    const item = revisions.find((entry) => entry.id === revisionId);
    if (item) {
      setSelectedRevision(item.number);
      setSource(null);
      invalidateQuote();
    }
  }
  /** Loads the previous page of revisions into the history. */
  function loadOlderRevisions() {
    if (!project) return;
    void run(async () => {
      const cursor =
        historyCursor === undefined
          ? project.nextRevisionCursor
          : historyCursor;
      if (cursor === null || cursor === undefined) return;
      const page = await api.history(cursor);
      setOlder((prior) => [...prior, ...page.revisions]);
      setHistoryCursor(page.nextRevisionCursor);
    });
  }
  function viewSource(revisionNumber: number) {
    void run(async () => setSource(await api.source(revisionNumber)));
  }
  function loadSourceForEditing(revisionNumber: number) {
    void run(async () => {
      const value = await api.source(revisionNumber);
      if (!isMounted.current) return;
      invalidateQuote();
      setMode('sourceCode');
      setText(value);
    });
  }
  function loadPropsForEditing(selected: IVisualRevision) {
    invalidateQuote();
    setMode('props');
    setText(JSON.stringify(selected.props, null, 2));
  }

  return {
    api,
    applyPreset,
    assetIds,
    cancelCurrent: () => void run(api.cancel),
    catalog,
    catalogModels,
    chooseProject,
    createNewProject,
    current,
    error: uiError,
    formats,
    frames,
    historyCursor,
    inheritedOutputs,
    isAcknowledged,
    isActive,
    isBusy,
    isModuleWorkEnabled,
    isQuoteBlocked,
    isStaleRevision,
    label,
    libraryAssets,
    loadOlderRevisions,
    loadPropsForEditing,
    loadSourceForEditing,
    mode,
    modeOptions,
    modelKey,
    modelOptions,
    modulePreferences,
    project,
    projectChoice,
    projects: knownProjects ?? [],
    propsText,
    reloadLatestRevision,
    requestQuote,
    review,
    revision,
    revisions,
    selectedModel,
    selectRevision,
    setIsAcknowledged,
    settings,
    source,
    submit,
    submitFromEditor,
    text,
    toggleAsset,
    toggleFormat,
    updateFrames,
    updateLabel,
    updateMode,
    updateModel,
    updatePropsText,
    updateSetting,
    updateText,
    viewSource,
  };
}

/** The Motion compose and revise state; see `useMotionComposer`. */
export type MotionComposerController = ReturnType<typeof useMotionComposer>;
