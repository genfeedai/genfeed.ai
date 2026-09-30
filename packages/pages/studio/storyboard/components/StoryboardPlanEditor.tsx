'use client';

import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';

import {
  useConfirmModal,
  useGalleryModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import {
  type StoryboardPlan,
  type StoryboardShot,
  storyboardPlanSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { StoryboardPlanEditorProps } from '@genfeedai/props/studio/storyboard.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StoryboardAnimatic from '@pages/studio/storyboard/components/StoryboardAnimatic';
import StoryboardRuntimeRail from '@pages/studio/storyboard/components/StoryboardRuntimeRail';
import StoryboardSaveIndicator from '@pages/studio/storyboard/components/StoryboardSaveIndicator';
import StoryboardSelect from '@pages/studio/storyboard/components/StoryboardSelect';
import { useStoryboardAssets } from '@pages/studio/storyboard/hooks/use-storyboard-assets';
import { useStoryboardAutosave } from '@pages/studio/storyboard/hooks/use-storyboard-autosave';
import { useStoryboardVoices } from '@pages/studio/storyboard/hooks/use-storyboard-voices';
import { normalizeStoryboardModel } from '@pages/studio/storyboard/utils/storyboard-capabilities';
import {
  editStoryboardShot,
  editStoryboardStyle,
  removeStoryboardShot,
  reorderStoryboardShots,
  storyboardApprovalProblems,
  storyboardAssetLabel,
} from '@pages/studio/storyboard/utils/storyboard-plan';
import { snapStoryboardDuration } from '@pages/studio/storyboard/utils/storyboard-runtime';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useImperativeHandle, useState } from 'react';

/** Draft edits persist independently of paid planning or video execution. */
export default function StoryboardPlanEditor({
  ref,
  run,
  draft,
  isSourceSaving = false,
  onSaveStatusChange,
  savePlan,
  resetPlan,
  approvePlan,
  capabilities,
  capabilityError,
  refreshCapabilities,
}: StoryboardPlanEditorProps) {
  const { openConfirm } = useConfirmModal();
  const { openGallery } = useGalleryModal();
  const {
    voices,
    status: voiceStatus,
    error: voiceError,
    retry: retryVoices,
  } = useStoryboardVoices(run.brandId, run.organizationId);
  const { href } = useOrgUrl();
  const [selectedShotId, setSelectedShotId] = useState<string>();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);
  const persistedPlan = run.config.plan;
  const autosave = useStoryboardAutosave<StoryboardPlan>({
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
          throw new Error(
            'Replace or clear unavailable saved voices before saving.',
          );
        const result = await savePlan(
          snapshot.revision,
          snapshot.value,
          signal,
          capabilities?.capabilityVersion,
        );
        if (!result.config.plan) throw new Error('Storyboard has no plan.');
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
  const timingDisabled =
    autosave.status === 'saving' || !model || !currentCapabilities;
  const isDisabled =
    working ||
    isSourceSaving ||
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
    ],
  );
  const problems = storyboardApprovalProblems(plan);
  for (const member of plan.cast)
    if (
      member.voiceId &&
      (voiceStatus !== 'loaded' ||
        !voices.some((voice) => voice.id === member.voiceId))
    )
      problems.push(
        `Saved voice for ${member.name} is unavailable. Replace or clear it.`,
      );
  if (!supportedDurations.length)
    problems.push('Video model capabilities are unavailable.');
  const approved =
    autosave.status === 'saved' &&
    run.config.approvedRevision === autosave.revision;

  function edit(next: StoryboardPlan) {
    if (isDisabled) return;
    const parsed = storyboardPlanSchema.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    autosave.edit(next);
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
      setError('Shorten another shot before increasing this duration.');
      return;
    }
    const snapped = snapStoryboardDuration(
      requested,
      supportedDurations,
      available,
    );
    if (snapped === undefined) {
      setError('No supported duration fits the remaining runtime.');
      return;
    }
    patchShot(shot, { durationSeconds: snapped });
  }
  async function perform(
    action: (revision: number, saved: StoryboardPlan) => Promise<unknown>,
  ) {
    setWorking(true);
    setError(undefined);
    try {
      const saved = await autosave.flush();
      await action(saved.revision, saved.value);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not update storyboard. Your edits are kept.',
      );
    } finally {
      setWorking(false);
    }
  }
  function reset() {
    openConfirm({
      isOpen: true,
      label: 'Reset storyboard?',
      message:
        'Restore the most recently generated plan. This saves a new revision.',
      confirmLabel: 'Reset plan',
      onConfirm: () => perform((revision) => resetPlan(revision)),
    });
  }
  function addShot() {
    const remaining =
      (plan.runtimeBudgetSeconds ?? 0) -
      plan.shots.reduce((sum, shot) => sum + (shot.durationSeconds ?? 0), 0);
    const minimum = Math.min(
      ...supportedDurations.filter((seconds) => seconds > 0),
    );
    if (
      plan.shots.length >= 12 ||
      !Number.isFinite(minimum) ||
      minimum > remaining
    ) {
      setError(
        'No room for another supported shot. Shorten a shot or increase the budget.',
      );
      return;
    }
    edit({
      ...plan,
      shots: [
        ...plan.shots,
        {
          id: crypto.randomUUID(),
          ordinal: plan.shots.length + 1,
          action: '',
          onScreenSpeaker: false,
          durationSeconds: minimum,
          stillFreshness: 'missing',
          transition: 'cut',
        },
      ],
    });
  }
  function pickStyleReferences() {
    openGallery({
      category: IngredientCategory.IMAGE,
      maxSelectableItems: 20 - plan.styleReferenceAssetIds.length,
      title: 'Style references',
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
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StoryboardSaveIndicator
          status={autosave.status}
          error={autosave.error}
          onRetry={() => void autosave.flush().catch(() => undefined)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            label="Undo"
            variant={ButtonVariant.SECONDARY}
            disabled={isDisabled || !autosave.canUndo}
            onClick={() => void perform(() => autosave.undo())}
          />
          <Button
            label="Reset plan"
            icon={<RotateCcw className="size-4" />}
            variant={ButtonVariant.SECONDARY}
            disabled={
              isDisabled ||
              !run.config.generatedPlan ||
              Boolean(draft && draft.status !== 'saved')
            }
            onClick={reset}
          />
          <Button
            label={approved ? 'Approved' : 'Approve storyboard'}
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
        </div>
      </div>
      {capabilityError || currentCapabilities?.status === 'unavailable' ? (
        <div role="status" className="space-y-2 text-sm text-muted-foreground">
          <p>
            {capabilityError ||
              `Video model unavailable: ${currentCapabilities?.reasonCode?.toLowerCase().replaceAll('_', ' ')}. Text edits and shot deletion remain available.`}
          </p>
          <Button
            label="Reload model capabilities"
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
      <Card label="Plan">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <Input
              value={plan.title}
              maxLength={120}
              disabled={isDisabled}
              onChange={(event) => edit({ ...plan, title: event.target.value })}
            />
          </Field>
          <Field label="Style">
            <Input
              value={plan.styleLabel ?? ''}
              maxLength={60}
              disabled={isDisabled}
              onChange={(event) =>
                edit(
                  editStoryboardStyle(plan, { styleLabel: event.target.value }),
                )
              }
            />
          </Field>
          <Field label="Logline" className="sm:col-span-2">
            <Textarea
              value={plan.logline}
              maxLength={300}
              disabled={isDisabled}
              onChange={(event) =>
                edit({ ...plan, logline: event.target.value })
              }
            />
          </Field>
          <Field label="Video model">
            <StoryboardSelect
              ariaLabel="Video model"
              value={plan.videoModelKey ?? '__automatic__'}
              placeholder="Choose video model"
              isDisabled={
                isDisabled ||
                autosave.status === 'saving' ||
                !currentCapabilities?.eligibleModels.length
              }
              options={[
                ...(currentCapabilities?.requestedModelKey === null &&
                currentCapabilities.effectiveModel
                  ? [
                      {
                        value: '__automatic__',
                        label: `Automatic: ${currentCapabilities.effectiveModel.label}`,
                      },
                    ]
                  : []),
                ...(currentCapabilities?.eligibleModels.map((candidate) => ({
                  value: candidate.key,
                  label: candidate.label,
                })) ?? []),
              ]}
              onChange={(key) => {
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
                        videoModelKey:
                          key === '__automatic__' ? null : (key ?? null),
                      },
                      selected,
                    ),
                  );
                } catch (caught) {
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : 'Could not switch video model.',
                  );
                }
              }}
            />
          </Field>
          <Field label="Format">
            <StoryboardSelect
              ariaLabel="Format"
              value={plan.format}
              placeholder="Choose format"
              isDisabled={isDisabled || timingDisabled}
              options={(
                model?.supportedFormats.filter((format) => format !== '4:5') ??
                []
              ).map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) => {
                if (value === '9:16' || value === '16:9' || value === '1:1')
                  edit({ ...plan, format: value });
              }}
            />
          </Field>
          <Field label="Runtime budget (seconds)">
            <Input
              type="number"
              min={1}
              max={60}
              value={plan.runtimeBudgetSeconds ?? ''}
              disabled={isDisabled || timingDisabled}
              onChange={(event) =>
                edit({
                  ...plan,
                  runtimeBudgetSeconds: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {plan.styleReferenceAssetIds.map((id, index) => (
            <Button
              key={id}
              label={`${storyboardAssetLabel(assets[`image:${id}`], `Reference ${index + 1}`)} ×`}
              ariaLabel={`Remove ${storyboardAssetLabel(assets[`image:${id}`], `reference ${index + 1}`)}`}
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              disabled={isDisabled}
              onClick={() =>
                edit(
                  editStoryboardStyle(plan, {
                    styleReferenceAssetIds: plan.styleReferenceAssetIds.filter(
                      (value) => value !== id,
                    ),
                  }),
                )
              }
            />
          ))}
          <Button
            label="Add style references"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            disabled={isDisabled || plan.styleReferenceAssetIds.length >= 20}
            onClick={pickStyleReferences}
          />
        </div>
      </Card>
      <Card
        label="Cast"
        description="Each speaker keeps one voice across their dialogue."
      >
        <div className="space-y-3">
          {voiceStatus === 'loading' ? (
            <p role="status">Loading saved voices…</p>
          ) : voiceStatus === 'failed' ? (
            <div role="alert">
              <p>{voiceError}</p>
              <Button
                label="Retry loading voices"
                variant={ButtonVariant.SECONDARY}
                onClick={retryVoices}
              />
            </div>
          ) : !voices.length ? (
            <p>
              No usable saved voices. Save a usable voice in Voices Library
              before assigning it.
            </p>
          ) : null}
          <Button asChild variant={ButtonVariant.SECONDARY}>
            <Link href={href(APP_ROUTES.LIBRARY.VOICES)}>Voices Library</Link>
          </Button>
          {plan.cast.map((member, index) => (
            <div
              key={member.id}
              className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Field label={`Speaker ${index + 1}`}>
                <Input
                  value={member.name}
                  maxLength={40}
                  disabled={isDisabled}
                  onChange={(event) =>
                    edit({
                      ...plan,
                      cast: plan.cast.map((item) =>
                        item.id === member.id
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="Voice">
                <StoryboardSelect
                  ariaLabel={`Voice for ${member.name}`}
                  value={member.voiceId}
                  placeholder="Choose voice"
                  isDisabled={isDisabled || voiceStatus === 'loading'}
                  options={[
                    ...(member.voiceId &&
                    !voices.some((voice) => voice.id === member.voiceId)
                      ? [
                          {
                            value: member.voiceId,
                            label: 'Saved voice unavailable — replace or clear',
                            isDisabled: true,
                          },
                        ]
                      : []),
                    ...voices.map((voice) => ({
                      value: voice.id,
                      label: storyboardAssetLabel(voice, 'Saved voice'),
                    })),
                  ]}
                  onChange={(voiceId) =>
                    edit({
                      ...plan,
                      cast: plan.cast.map((item) =>
                        item.id === member.id ? { ...item, voiceId } : item,
                      ),
                    })
                  }
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  label={
                    member.avatarAssetId
                      ? 'Change avatar image'
                      : 'Choose avatar image'
                  }
                  variant={ButtonVariant.SECONDARY}
                  disabled={isDisabled}
                  onClick={() =>
                    openGallery({
                      category: IngredientCategory.IMAGE,
                      maxSelectableItems: 1,
                      title: `Avatar image for ${member.name}`,
                      onSelect: (items) => {
                        const item = items.find(
                          (candidate) =>
                            candidate.brandId === run.brandId &&
                            !candidate.isDeleted,
                        );
                        if (item)
                          edit({
                            ...plan,
                            cast: plan.cast.map((candidate) =>
                              candidate.id === member.id
                                ? { ...candidate, avatarAssetId: item.id }
                                : candidate,
                            ),
                          });
                      },
                    })
                  }
                />
                {member.avatarAssetId ? (
                  <Button
                    label="Clear avatar"
                    variant={ButtonVariant.SECONDARY}
                    disabled={isDisabled}
                    onClick={() =>
                      edit({
                        ...plan,
                        cast: plan.cast.map((candidate) =>
                          candidate.id === member.id
                            ? { ...candidate, avatarAssetId: undefined }
                            : candidate,
                        ),
                        shots: plan.shots.map((shot) =>
                          shot.speakerId === member.id
                            ? { ...shot, onScreenSpeaker: false }
                            : shot,
                        ),
                      })
                    }
                  />
                ) : null}
              </div>
              <Button
                ariaLabel={`Remove ${member.name}`}
                icon={<Trash2 className="size-4" />}
                variant={ButtonVariant.SECONDARY}
                disabled={isDisabled}
                onClick={() =>
                  edit({
                    ...plan,
                    cast: plan.cast.filter((item) => item.id !== member.id),
                    shots: plan.shots.map((shot) =>
                      shot.speakerId === member.id
                        ? {
                            ...shot,
                            speakerId: undefined,
                            onScreenSpeaker: false,
                          }
                        : shot,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
        <Button
          className="mt-3"
          label="Add speaker"
          icon={<Plus className="size-4" />}
          variant={ButtonVariant.SECONDARY}
          disabled={isDisabled || plan.cast.length >= 6}
          onClick={() => {
            let index = plan.cast.length + 1;
            while (
              plan.cast.some((member) => member.name === `Speaker ${index}`)
            )
              index++;
            edit({
              ...plan,
              cast: [
                ...plan.cast,
                {
                  id: crypto.randomUUID(),
                  name: `Speaker ${index}`,
                  referenceAssetIds: [],
                },
              ],
            });
          }}
        />
      </Card>
      <StoryboardRuntimeRail
        budgetSeconds={plan.runtimeBudgetSeconds}
        shots={plan.shots}
        selectedShotId={selectedShotId}
        onSelectShot={(id) => {
          setSelectedShotId(id);
          document
            .getElementById(`shot-${id}`)
            ?.scrollIntoView({ block: 'nearest' });
        }}
      />
      <StoryboardAnimatic
        scope={`${run.id}:${autosave.revision}:${JSON.stringify(plan.shots)}`}
        shots={plan.shots.map((shot) => ({
          id: shot.id,
          ordinal: shot.ordinal,
          durationSeconds: shot.durationSeconds,
          dialogue: shot.dialogue,
          stillUrl:
            shot.stillFreshness === 'fresh' && shot.stillAssetId
              ? (assets[`image:${shot.stillAssetId}`]?.cdnUrl ?? undefined)
              : undefined,
        }))}
      />
      {!supportedDurations.length ? (
        <p role="status" className="text-xs text-muted-foreground">
          Duration editing and adding shots become available when the supported
          model durations are resolved.
        </p>
      ) : null}
      <div className="space-y-3">
        {plan.shots.map((shot, index) => (
          <section
            key={shot.id}
            id={`shot-${shot.id}`}
            aria-label={`Shot ${shot.ordinal}`}
          >
            <Card
              label={`Shot ${shot.ordinal}`}
              description={`Still: ${shot.stillFreshness}`}
            >
              <div className="mb-3 max-w-sm">
                {shot.stillAssetId &&
                assets[`image:${shot.stillAssetId}`]?.cdnUrl ? (
                  <AgentMediaArtifactPreview
                    displayMode="featured"
                    assets={[
                      {
                        kind: 'image',
                        url: assets[`image:${shot.stillAssetId}`].cdnUrl || '',
                        title: storyboardAssetLabel(
                          assets[`image:${shot.stillAssetId}`],
                          `Shot ${shot.ordinal}`,
                        ),
                        width:
                          assets[`image:${shot.stillAssetId}`].metadataWidth,
                        height:
                          assets[`image:${shot.stillAssetId}`].metadataHeight,
                        alt: `Still for shot ${shot.ordinal}`,
                      },
                    ]}
                  />
                ) : (
                  <p className="flex aspect-video items-center justify-center rounded-md border border-border text-xs text-muted-foreground">
                    Still preview unavailable
                  </p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Section">
                  <Input
                    value={shot.sectionLabel ?? ''}
                    maxLength={40}
                    disabled={isDisabled}
                    onChange={(event) =>
                      patchShot(shot, { sectionLabel: event.target.value })
                    }
                  />
                </Field>
                <Field label="Duration (seconds)">
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={shot.durationSeconds ?? ''}
                    disabled={isDisabled || timingDisabled}
                    onChange={(event) =>
                      duration(shot, Number(event.target.value))
                    }
                  />
                </Field>
                <Field label="Transition">
                  <StoryboardSelect
                    ariaLabel={`Shot ${shot.ordinal} transition`}
                    value={shot.transition}
                    placeholder="Choose transition"
                    isDisabled={isDisabled || timingDisabled}
                    options={[
                      { value: 'cut', label: 'Cut' },
                      { value: 'stitch', label: 'Stitch' },
                      ...(model?.hasInterpolation &&
                      index < plan.shots.length - 1 &&
                      shot.stillFreshness === 'fresh' &&
                      plan.shots[index + 1]?.stillFreshness === 'fresh'
                        ? [{ value: 'interpolate', label: 'Interpolate' }]
                        : []),
                    ]}
                    onChange={(value) => {
                      if (
                        value === 'cut' ||
                        value === 'stitch' ||
                        value === 'interpolate'
                      )
                        patchShot(shot, { transition: value });
                    }}
                  />
                </Field>
                <Field label="Action" className="sm:col-span-2">
                  <Textarea
                    value={shot.action}
                    maxLength={4000}
                    disabled={isDisabled}
                    onChange={(event) =>
                      patchShot(shot, { action: event.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Dialogue"
                  helpText={shot.dialogue?.trim() ? undefined : 'No dialogue'}
                >
                  <Textarea
                    value={shot.dialogue ?? ''}
                    maxLength={500}
                    disabled={isDisabled}
                    onChange={(event) =>
                      patchShot(shot, { dialogue: event.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Notes"
                  helpText="Notes are saved with the plan and excluded from generation."
                >
                  <Textarea
                    value={shot.notes ?? ''}
                    maxLength={1000}
                    disabled={isDisabled}
                    onChange={(event) =>
                      patchShot(shot, { notes: event.target.value })
                    }
                  />
                </Field>
                <Field label="Speaker">
                  <StoryboardSelect
                    ariaLabel={`Speaker for shot ${shot.ordinal}`}
                    value={shot.speakerId}
                    placeholder="Choose speaker"
                    isDisabled={isDisabled}
                    options={plan.cast.map((member) => ({
                      value: member.id,
                      label: member.name,
                    }))}
                    onChange={(speakerId) =>
                      patchShot(shot, {
                        speakerId,
                        onScreenSpeaker: speakerId
                          ? shot.onScreenSpeaker
                          : false,
                      })
                    }
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={shot.onScreenSpeaker}
                    disabled={
                      isDisabled ||
                      !plan.cast.find((member) => member.id === shot.speakerId)
                        ?.avatarAssetId
                    }
                    onCheckedChange={(checked) =>
                      patchShot(shot, { onScreenSpeaker: checked === true })
                    }
                  />
                  Speaker on screen
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  ariaLabel={`Move shot ${shot.ordinal} up`}
                  icon={<ArrowUp className="size-4" />}
                  variant={ButtonVariant.SECONDARY}
                  disabled={isDisabled || timingDisabled || index === 0}
                  onClick={() =>
                    edit(reorderStoryboardShots(plan, shot.id, -1))
                  }
                />
                <Button
                  ariaLabel={`Move shot ${shot.ordinal} down`}
                  icon={<ArrowDown className="size-4" />}
                  variant={ButtonVariant.SECONDARY}
                  disabled={
                    isDisabled ||
                    timingDisabled ||
                    index === plan.shots.length - 1
                  }
                  onClick={() => edit(reorderStoryboardShots(plan, shot.id, 1))}
                />
                <Button
                  label="Delete shot"
                  icon={<Trash2 className="size-4" />}
                  variant={ButtonVariant.SECONDARY}
                  disabled={isDisabled}
                  onClick={() => edit(removeStoryboardShot(plan, shot.id))}
                />
              </div>
            </Card>
          </section>
        ))}
      </div>
      <Button
        label="Add shot"
        icon={<Plus className="size-4" />}
        variant={ButtonVariant.SECONDARY}
        disabled={isDisabled || plan.shots.length >= 12 || timingDisabled}
        onClick={addShot}
      />
      {problems.length ? (
        <div role="status" className="space-y-1 text-xs text-muted-foreground">
          <p>Before approving:</p>
          <ul className="list-disc pl-4">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
