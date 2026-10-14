'use client';

import {
  useConfirmModal,
  useGalleryModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useRegisterBreadcrumbLeaf } from '@genfeedai/contexts/ui/breadcrumb-leaf-context';
import { ContextSidebarPanel } from '@genfeedai/contexts/ui/context-sidebar-context';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import {
  type StoryboardShot,
  storyboardImportedPlanSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type {
  StoryboardEditablePlan,
  StoryboardPlanEditorProps,
} from '@genfeedai/props/studio/storyboard.props';
import StoryboardAnimatic from '@pages/studio/storyboard/components/StoryboardAnimatic';
import StoryboardCastPanel from '@pages/studio/storyboard/components/StoryboardCastPanel';
import StoryboardDetailsPanel from '@pages/studio/storyboard/components/StoryboardDetailsPanel';
import StoryboardInspector from '@pages/studio/storyboard/components/StoryboardInspector';
import StoryboardReferencesPanel from '@pages/studio/storyboard/components/StoryboardReferencesPanel';
import StoryboardRuntimeRail from '@pages/studio/storyboard/components/StoryboardRuntimeRail';
import StoryboardSaveIndicator from '@pages/studio/storyboard/components/StoryboardSaveIndicator';
import StoryboardShotCard from '@pages/studio/storyboard/components/StoryboardShotCard';
import StoryboardShotJoint from '@pages/studio/storyboard/components/StoryboardShotJoint';
import { useStoryboardAssets } from '@pages/studio/storyboard/hooks/use-storyboard-assets';
import { useStoryboardAutosave } from '@pages/studio/storyboard/hooks/use-storyboard-autosave';
import { useStoryboardVoices } from '@pages/studio/storyboard/hooks/use-storyboard-voices';
import { normalizeStoryboardModel } from '@pages/studio/storyboard/utils/storyboard-capabilities';
import {
  editStoryboardShot,
  editStoryboardStyle,
  insertStoryboardShot,
  removeStoryboardShot,
  reorderStoryboardShots,
  storyboardApprovalProblems,
  storyboardAssetLabel,
} from '@pages/studio/storyboard/utils/storyboard-plan';
import {
  snapStoryboardDuration,
  storyboardRuntimeRanges,
} from '@pages/studio/storyboard/utils/storyboard-runtime';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import { Clapperboard, Plus, RotateCcw, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment, useEffect, useImperativeHandle, useState } from 'react';

const MAX_SHOTS = 12;

/** Draft edits persist independently of paid planning or video execution. */
export default function StoryboardPlanEditor({
  ref,
  run,
  actions,
  composer,
  draft,
  isDrafting = false,
  isSourceSaving = false,
  notices,
  onDraftFromBrief,
  onSaveStatusChange,
  savePlan,
  resetPlan,
  approvePlan,
  capabilities,
  capabilityError,
  refreshCapabilities,
  sourceBrief,
}: StoryboardPlanEditorProps) {
  const translate = useTranslations('pages.studioStoryboard.plan');
  const translateDraft = useTranslations('pages.studioStoryboard.draft');
  const translateInspector = useTranslations(
    'pages.studioStoryboard.inspector',
  );
  const translateWorkspace = useTranslations(
    'pages.studioStoryboard.workspace',
  );
  const { openConfirm } = useConfirmModal();
  const { openGallery } = useGalleryModal();
  const {
    voices,
    status: voiceStatus,
    error: voiceError,
    retry: retryVoices,
  } = useStoryboardVoices(run.brandId, run.organizationId);
  const [selectedShotId, setSelectedShotId] = useState<string>();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);
  const persistedPlan = run.config.plan;
  const autosave = useStoryboardAutosave<StoryboardEditablePlan>({
    binding: draft,
    scope: `${run.brandId}:${run.id}`,
    initial: {
      revision: run.config.revision,
      value: persistedPlan ?? {
        title: '',
        logline: '',
        format: '9:16',
        videoModelKey: null,
        runtimeBudgetSeconds: null,
        styleReferenceAssetIds: [],
        cast: [],
        shots: [],
      },
    },
    save: async (snapshot, signal) => {
      try {
        if (
          snapshot.value.cast.some(
            (member) =>
              member.voiceId &&
              (voiceStatus !== 'loaded' ||
                !voices.some((voice) => voice.id === member.voiceId)),
          )
        )
          throw new Error(translate('replaceVoicesBeforeSave'));
        const result = await savePlan(
          snapshot.revision,
          snapshot.value,
          signal,
          capabilities?.capabilityVersion,
        );
        if (!result.config.plan) throw new Error(translate('missingPlan'));
        return { revision: result.config.revision, value: result.config.plan };
      } catch (caught) {
        refreshCapabilities?.();
        throw caught;
      }
    },
  });
  useImperativeHandle(ref, () => ({ flush: autosave.flush }), [autosave.flush]);
  useEffect(() => {
    onSaveStatusChange?.(autosave.status);
  }, [onSaveStatusChange, autosave.status]);
  const plan = autosave.value;
  const title = plan.title.trim() || translateDraft('untitled');
  useRegisterBreadcrumbLeaf(run.id, title);
  const currentCapabilities =
    capabilities?.runId === run.id &&
    capabilities.runRevision === autosave.revision
      ? capabilities
      : undefined;
  const model =
    plan.videoModelKey === currentCapabilities?.requestedModelKey
      ? currentCapabilities?.effectiveModel
      : currentCapabilities?.eligibleModels.find(
          (candidate) => candidate.key === plan.videoModelKey,
        );
  const supportedDurations = model?.supportedDurationsSeconds ?? [];
  // A new shot needs a supported length; until one resolves, adding is unavailable.
  const hasShotDuration = supportedDurations.some((seconds) => seconds > 0);
  const timingDisabled =
    autosave.status === 'saving' || !model || !currentCapabilities;
  const isDisabled =
    working ||
    isSourceSaving ||
    isDrafting ||
    ['analysing', 'generating', 'assembling'].includes(run.config.state);
  const assets = useStoryboardAssets(
    `${run.id}:${autosave.revision}`,
    run.brandId,
    [
      ...plan.shots.flatMap((shot) =>
        shot.stillAssetId
          ? [{ id: shot.stillAssetId, kind: 'image' as const }]
          : [],
      ),
      ...plan.styleReferenceAssetIds.map((id) => ({
        id,
        kind: 'image' as const,
      })),
      ...plan.cast
        .flatMap((member) => [
          ...(member.avatarAssetId ? [member.avatarAssetId] : []),
          ...member.referenceAssetIds,
        ])
        .map((id) => ({ id, kind: 'image' as const })),
    ],
  );
  const problems = storyboardApprovalProblems(plan);
  for (const member of plan.cast)
    if (
      member.voiceId &&
      (voiceStatus !== 'loaded' ||
        !voices.some((voice) => voice.id === member.voiceId))
    )
      problems.push(translate('voiceUnavailableFor', { name: member.name }));
  if (!supportedDurations.length)
    problems.push(translate('capabilitiesUnavailable'));
  const approved =
    autosave.status === 'saved' &&
    run.config.approvedRevision === autosave.revision;
  const hasShots = plan.shots.length > 0;
  const ranges = storyboardRuntimeRanges(plan.shots);
  const usedSeconds = plan.shots.reduce(
    (sum, shot) => sum + (shot.durationSeconds ?? 0),
    0,
  );
  const stillUrl = (shot: StoryboardShot) =>
    shot.stillFreshness === 'fresh' && shot.stillAssetId
      ? (assets[`image:${shot.stillAssetId}`]?.cdnUrl ?? undefined)
      : undefined;

  function edit(next: unknown) {
    if (isDisabled) return;
    const parsed = storyboardImportedPlanSchema.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    autosave.edit(parsed.data);
  }
  function patchShot(shot: StoryboardShot, patch: Partial<StoryboardShot>) {
    edit(editStoryboardShot(plan, shot.id, patch));
  }
  function duration(shot: StoryboardShot, requested: number) {
    const usedElsewhere = plan.shots.reduce(
      (sum, current) =>
        sum + (current.id === shot.id ? 0 : (current.durationSeconds ?? 0)),
      0,
    );
    const available = (plan.runtimeBudgetSeconds ?? 0) - usedElsewhere;
    // Refuse an over-budget request instead of silently shortening it to fit.
    if (requested > available) {
      setError(translate('shortenBeforeIncrease'));
      return;
    }
    const snapped = snapStoryboardDuration(
      requested,
      supportedDurations,
      available,
    );
    if (snapped === undefined) {
      setError(translate('noSupportedDuration'));
      return;
    }
    patchShot(shot, { durationSeconds: snapped });
  }
  async function perform(
    action: (
      revision: number,
      saved: StoryboardEditablePlan,
    ) => Promise<unknown>,
  ) {
    setWorking(true);
    setError(undefined);
    try {
      const saved = await autosave.flush();
      await action(saved.revision, saved.value);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : translate('updateFailed'),
      );
    } finally {
      setWorking(false);
    }
  }
  function reset() {
    openConfirm({
      isOpen: true,
      label: translate('resetConfirm'),
      message: translate('resetMessage'),
      confirmLabel: translate('resetPlan'),
      onConfirm: () => perform((revision) => resetPlan(revision)),
    });
  }
  function addShot(position = plan.shots.length) {
    const remaining =
      (plan.runtimeBudgetSeconds ?? 0) -
      plan.shots.reduce((sum, shot) => sum + (shot.durationSeconds ?? 0), 0);
    const minimum = Math.min(
      ...supportedDurations.filter((seconds) => seconds > 0),
    );
    if (
      plan.shots.length >= MAX_SHOTS ||
      !Number.isFinite(minimum) ||
      minimum > remaining
    ) {
      setError(translate('noRoomForShot'));
      return;
    }
    edit(
      insertStoryboardShot(plan, position, {
        id: crypto.randomUUID(),
        action: '',
        onScreenSpeaker: false,
        durationSeconds: minimum,
        stillFreshness: 'missing',
        transition: 'cut',
      }),
    );
  }
  function changeModel(key: string | undefined) {
    const selected =
      key === '__automatic__'
        ? currentCapabilities?.effectiveModel
        : currentCapabilities?.eligibleModels.find(
            (candidate) => candidate.key === key,
          );
    if (!selected) return;
    try {
      edit(
        normalizeStoryboardModel(
          {
            ...plan,
            videoModelKey: key === '__automatic__' ? null : (key ?? null),
          },
          selected,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : translate('switchModelFailed'),
      );
    }
  }
  function pickStyleReferences() {
    openGallery({
      category: IngredientCategory.IMAGE,
      maxSelectableItems: 20 - plan.styleReferenceAssetIds.length,
      title: translate('styleReferences'),
      onSelect: (selected) => {
        const ids = selected
          .filter((item) => item.brandId === run.brandId && !item.isDeleted)
          .map((item) => item.id);
        edit(
          editStoryboardStyle(plan, {
            styleReferenceAssetIds: [
              ...new Set([...plan.styleReferenceAssetIds, ...ids]),
            ].slice(0, 20),
          }),
        );
      },
    });
  }
  function selectShot(id: string) {
    setSelectedShotId(id);
    document
      .getElementById(`shot-${id}`)
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  const references = [
    ...plan.styleReferenceAssetIds.map((id, index) => ({
      id: `style:${id}`,
      title: storyboardAssetLabel(
        assets[`image:${id}`],
        translate('referenceFallback', { ordinal: index + 1 }),
      ),
      group: translate('styleReferences'),
      kind: 'image' as const,
      url: assets[`image:${id}`]?.cdnUrl ?? undefined,
      onRemove: isDisabled
        ? undefined
        : () =>
            edit(
              editStoryboardStyle(plan, {
                styleReferenceAssetIds: plan.styleReferenceAssetIds.filter(
                  (value) => value !== id,
                ),
              }),
            ),
    })),
    ...plan.cast.flatMap((member) =>
      [
        ...new Set([
          ...(member.avatarAssetId ? [member.avatarAssetId] : []),
          ...member.referenceAssetIds,
        ]),
      ].map((id) => ({
        id: `cast:${member.id}:${id}`,
        title: member.name,
        group: translateWorkspace('characters'),
        kind: 'image' as const,
        url: assets[`image:${id}`]?.cdnUrl ?? undefined,
      })),
    ),
  ];
  const inspectorState = approved
    ? 'approved'
    : isDrafting
      ? 'drafting'
      : hasShots
        ? 'draft'
        : 'brief';
  const inspectorShots = plan.shots.map((shot) => ({
    id: shot.id,
    ordinal: shot.ordinal,
    name:
      shot.sectionLabel?.trim() || translate('shot', { ordinal: shot.ordinal }),
    durationSeconds: shot.durationSeconds,
    isStillFresh: shot.stillFreshness === 'fresh',
    stillUrl: stillUrl(shot),
  }));

  return (
    <>
      <Container
        label={title}
        moduleChrome
        leading={
          <StoryboardRuntimeRail
            budgetSeconds={plan.runtimeBudgetSeconds}
            formatLabel={plan.format}
            shots={plan.shots}
            selectedShotId={selectedShotId}
            onSelectShot={selectShot}
          />
        }
        iconActions={
          <>
            <StoryboardSaveIndicator
              status={autosave.status}
              error={autosave.error}
              onRetry={() => void autosave.flush().catch(() => undefined)}
            />
            <Button
              ariaLabel={translate('undo')}
              icon={<Undo2 className="size-4" />}
              isDisabled={isDisabled || !autosave.canUndo}
              onClick={() => void perform(() => autosave.undo())}
              size={ButtonSize.ICON}
              tooltip={translate('undo')}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
            <Button
              ariaLabel={translate('resetPlan')}
              icon={<RotateCcw className="size-4" />}
              isDisabled={
                isDisabled ||
                !run.config.generatedPlan ||
                Boolean(draft && draft.status !== 'saved')
              }
              onClick={reset}
              size={ButtonSize.ICON}
              tooltip={translate('resetPlan')}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </>
        }
        right={
          <>
            {actions}
            <Button
              label={approved ? translate('approved') : translate('approve')}
              disabled={
                isDisabled ||
                approved ||
                problems.length > 0 ||
                autosave.status === 'failed' ||
                Boolean(draft && draft.status !== 'saved')
              }
              onClick={() =>
                void perform((revision, saved) => {
                  const blockers = storyboardApprovalProblems(saved);
                  if (blockers.length) throw new Error(blockers.join(' '));
                  return approvePlan(revision);
                })
              }
            />
          </>
        }
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          {notices}
          {capabilityError || currentCapabilities?.status === 'unavailable' ? (
            <div
              role="status"
              className="space-y-2 text-sm text-muted-foreground"
            >
              <p>
                {capabilityError ||
                  translate('modelUnavailable', {
                    reason:
                      currentCapabilities?.reasonCode
                        ?.toLowerCase()
                        .replaceAll('_', ' ') ?? '',
                  })}
              </p>
              <Button
                label={translate('reloadCapabilities')}
                variant={ButtonVariant.SECONDARY}
                onClick={refreshCapabilities}
              />
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {isDrafting ? (
            <div aria-busy="true" className="flex flex-col gap-3">
              <p role="status" className="sr-only">
                {translateDraft('drafting')}
              </p>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-56 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          ) : hasShots ? (
            <>
              <StoryboardAnimatic
                scope={`${run.id}:${autosave.revision}:${JSON.stringify(plan.shots)}`}
                shots={plan.shots.map((shot) => ({
                  id: shot.id,
                  ordinal: shot.ordinal,
                  durationSeconds: shot.durationSeconds,
                  dialogue: shot.dialogue,
                  stillUrl: stillUrl(shot),
                }))}
              />
              {!supportedDurations.length ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {translate('durationUntilResolved')}
                </p>
              ) : null}
              <div className="flex flex-col gap-3">
                {plan.shots.map((shot, index) => {
                  const asset = shot.stillAssetId
                    ? assets[`image:${shot.stillAssetId}`]
                    : undefined;
                  const next = plan.shots[index + 1];
                  return (
                    <Fragment key={shot.id}>
                      <StoryboardShotCard
                        brandId={run.brandId}
                        cast={plan.cast}
                        characterReplacement={run.config.characterReplacements?.find(
                          (item) => item.shotId === shot.id,
                        )}
                        endSeconds={ranges[index]?.endSeconds ?? 0}
                        format={plan.format}
                        index={index}
                        isDisabled={isDisabled}
                        isSelected={selectedShotId === shot.id}
                        isTimingDisabled={timingDisabled}
                        onChangeDuration={(seconds) => duration(shot, seconds)}
                        onDelete={() =>
                          edit(removeStoryboardShot(plan, shot.id))
                        }
                        onMove={(offset) =>
                          edit(reorderStoryboardShots(plan, shot.id, offset))
                        }
                        onPatch={(patch) => patchShot(shot, patch)}
                        runId={run.id}
                        shot={shot}
                        shotCount={plan.shots.length}
                        startSeconds={ranges[index]?.startSeconds ?? 0}
                        still={
                          asset?.cdnUrl
                            ? {
                                url: asset.cdnUrl,
                                title: storyboardAssetLabel(
                                  asset,
                                  translate('shot', { ordinal: shot.ordinal }),
                                ),
                                width: asset.metadataWidth,
                                height: asset.metadataHeight,
                              }
                            : undefined
                        }
                        supportedDurations={supportedDurations}
                      />
                      {next ? (
                        <StoryboardShotJoint
                          canAddShot={
                            plan.shots.length < MAX_SHOTS && hasShotDuration
                          }
                          index={index}
                          interpolationAvailable={Boolean(
                            model?.hasInterpolation &&
                              shot.stillFreshness === 'fresh' &&
                              next.stillFreshness === 'fresh',
                          )}
                          isDisabled={isDisabled || timingDisabled}
                          onAddShot={() => addShot(index + 1)}
                          onChangeTransition={(transition) =>
                            patchShot(shot, { transition })
                          }
                          transition={shot.transition}
                        />
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>
              <Button
                className="self-center"
                label={translate('addShot')}
                icon={<Plus className="size-4" />}
                variant={ButtonVariant.SECONDARY}
                disabled={
                  isDisabled ||
                  plan.shots.length >= MAX_SHOTS ||
                  timingDisabled ||
                  !hasShotDuration
                }
                onClick={() => addShot()}
              />
              {problems.length ? (
                <div
                  role="status"
                  className="space-y-1 text-xs text-muted-foreground"
                >
                  <p>{translate('beforeApproving')}</p>
                  <ul className="list-disc pl-4">
                    {problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <CardEmptyContent
              icon={Clapperboard}
              label={translateDraft('emptyTitle')}
              description={translateDraft('emptyDescription')}
              actions={
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  {sourceBrief && onDraftFromBrief ? (
                    <Button
                      label={translateDraft('draftFromBrief')}
                      variant={ButtonVariant.SECONDARY}
                      disabled={isDisabled}
                      onClick={onDraftFromBrief}
                    />
                  ) : null}
                  <Button
                    label={translate('addShot')}
                    icon={<Plus className="size-4" />}
                    variant={ButtonVariant.GHOST}
                    disabled={isDisabled || timingDisabled || !hasShotDuration}
                    tooltip={
                      hasShotDuration
                        ? undefined
                        : translate('durationUntilResolved')
                    }
                    onClick={() => addShot()}
                  />
                </div>
              }
            />
          )}
        </div>
        {composer}
      </Container>
      <ContextSidebarPanel
        selection={{
          id: run.id,
          isOpenByDefault: true,
          kind: 'run',
          origin: 'automatic',
          subtitle: translateInspector('subtitle', {
            state: translateInspector(`states.${inspectorState}`),
          }),
          title,
        }}
      >
        <StoryboardInspector
          cast={
            <StoryboardCastPanel
              brandId={run.brandId}
              isDisabled={isDisabled}
              onChange={edit}
              onRetryVoices={retryVoices}
              plan={plan}
              voiceError={voiceError}
              voiceStatus={voiceStatus}
              voices={voices}
            />
          }
          castCount={plan.cast.length}
          details={
            <StoryboardDetailsPanel
              isDisabled={isDisabled}
              isTimingDisabled={timingDisabled}
              modelCapabilities={currentCapabilities}
              onChange={edit}
              onChangeModel={changeModel}
              plan={plan}
              sourceBrief={sourceBrief}
              supportedFormats={(model?.supportedFormats ?? []).filter(
                (format) => format !== '4:5',
              )}
            />
          }
          onSelectShot={selectShot}
          referenceCount={references.length}
          references={
            <StoryboardReferencesPanel
              references={references}
              actions={
                <Button
                  label={translate('addStyleReferences')}
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  disabled={
                    isDisabled || plan.styleReferenceAssetIds.length >= 20
                  }
                  onClick={pickStyleReferences}
                />
              }
            />
          }
          selectedShotId={selectedShotId}
          shots={inspectorShots}
          totalSeconds={usedSeconds}
        />
      </ContextSidebarPanel>
    </>
  );
}
