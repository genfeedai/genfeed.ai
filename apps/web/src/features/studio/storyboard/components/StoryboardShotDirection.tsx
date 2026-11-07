'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  STORYBOARD_REFERENCE_ROLES,
  STORYBOARD_SHOT_LIMITS,
  type StoryboardReferenceRole,
  type StoryboardShotCut,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { compileStoryboardShotPrompt } from '@genfeedai/contracts/api-types/contracts/storyboard-shot-prompt.contract';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { ChevronDown, ChevronRight, ImagePlus, Plus, X } from 'lucide-react';
import NextImage from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { StoryboardShotDirectionProps } from '@/features/studio/props/storyboard.props';
import StoryboardSelect from '@/features/studio/storyboard/components/StoryboardSelect';

const ROLE_LABELS = {
  environment: 'roleEnvironment',
  character_face: 'roleCharacterFace',
  character_body: 'roleCharacterBody',
  prop: 'roleProp',
  style: 'roleStyle',
} as const satisfies Record<StoryboardReferenceRole, string>;

interface CutDraft {
  startSeconds: string;
  endSeconds: string;
  framing: string;
  camera: string;
}

function toDraft(cut: StoryboardShotCut): CutDraft {
  return {
    startSeconds: String(cut.startSeconds),
    endSeconds: String(cut.endSeconds),
    framing: cut.framing,
    camera: cut.camera ?? '',
  };
}

function fromDraft(draft: CutDraft): StoryboardShotCut | undefined {
  const startSeconds = Number(draft.startSeconds);
  const endSeconds = Number(draft.endSeconds);
  const framing = draft.framing.trim();
  if (
    !framing ||
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds)
  )
    return undefined;
  return {
    startSeconds,
    endSeconds,
    framing,
    ...(draft.camera.trim() ? { camera: draft.camera.trim() } : {}),
  };
}

/**
 * How the video model should film one shot (#9617): timed cuts, sound
 * effects, what each reference image is, and the prompt those compile to on
 * the storyboard's model, shown before anything is spent.
 */
export default function StoryboardShotDirection({
  plan,
  shot,
  model,
  referenceUrls,
  isDisabled,
  onPatch,
  onAddReference,
}: StoryboardShotDirectionProps) {
  const translate = useTranslations('pages.studioStoryboard.direction');
  const hasDirection = Boolean(
    shot.cuts?.length ||
      shot.sfx?.length ||
      shot.referenceRoles?.length ||
      shot.videoPrompt,
  );
  const [isOpen, setIsOpen] = useState(hasDirection);
  const [cutDrafts, setCutDrafts] = useState<CutDraft[]>(() =>
    (shot.cuts ?? []).map(toDraft),
  );
  const [sfxText, setSfxText] = useState((shot.sfx ?? []).join(', '));
  const [newRole, setNewRole] =
    useState<StoryboardReferenceRole>('environment');
  const compiled = model
    ? compileStoryboardShotPrompt(plan, shot, {
        isAudioEnabled: Boolean(model.hasAudio),
        maxReferences: model.maxReferences ?? 0,
      })
    : undefined;
  const isOverLimit = Boolean(
    compiled &&
      model?.maxReferences !== undefined &&
      compiled.namedReferenceCount > model.maxReferences,
  );
  const roleOptions = STORYBOARD_REFERENCE_ROLES.map((role) => ({
    value: role,
    label: translate(ROLE_LABELS[role]),
  }));

  function commitCuts(drafts: readonly CutDraft[]) {
    const cuts = drafts.flatMap((draft) => {
      const cut = fromDraft(draft);
      return cut ? [cut] : [];
    });
    onPatch({ cuts: cuts.length ? cuts : undefined });
  }
  function editCut(index: number, patch: Partial<CutDraft>) {
    setCutDrafts((current) =>
      current.map((draft, at) =>
        at === index ? { ...draft, ...patch } : draft,
      ),
    );
  }
  function addCut() {
    const last = (shot.cuts ?? []).at(-1);
    const start = last?.endSeconds ?? 0;
    const end = Math.min(shot.durationSeconds ?? start + 2, start + 2);
    const next = [
      ...cutDrafts,
      {
        startSeconds: String(start),
        endSeconds: String(end),
        framing: '',
        camera: '',
      },
    ];
    setCutDrafts(next);
  }
  function removeCut(index: number) {
    const next = cutDrafts.filter((_, at) => at !== index);
    setCutDrafts(next);
    commitCuts(next);
  }
  function commitSfx() {
    const sfx = sfxText
      .split(',')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, STORYBOARD_SHOT_LIMITS.maxSfx);
    onPatch({ sfx: sfx.length ? sfx : undefined });
  }
  function editRole(
    assetId: string,
    patch: { role?: StoryboardReferenceRole; label?: string },
  ) {
    onPatch({
      referenceRoles: (shot.referenceRoles ?? []).map((reference) =>
        reference.assetId === assetId ? { ...reference, ...patch } : reference,
      ),
    });
  }
  function removeRole(assetId: string) {
    const next = (shot.referenceRoles ?? []).filter(
      (reference) => reference.assetId !== assetId,
    );
    onPatch({ referenceRoles: next.length ? next : undefined });
  }

  return (
    <div className="border-t border-border px-4 py-2">
      <Button
        aria-expanded={isOpen}
        icon={
          isOpen ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )
        }
        label={translate('title')}
        onClick={() => setIsOpen((open) => !open)}
        size={ButtonSize.SM}
        variant={ButtonVariant.GHOST}
      />
      {isOpen ? (
        <div className="flex flex-col gap-4 pb-2 pt-2">
          <div
            aria-label={translate('cuts')}
            className="flex flex-col gap-2"
            role="group"
          >
            <p className="text-xs font-medium text-foreground">
              {translate('cuts')}
            </p>
            {cutDrafts.map((draft, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: cuts have no id; their order is their identity.
                key={index}
                className="grid gap-2 sm:grid-cols-[4.5rem_4.5rem_minmax(0,1fr)_minmax(0,1fr)_auto]"
                onBlur={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    commitCuts(cutDrafts);
                }}
              >
                <Input
                  aria-label={translate('cutStart', { ordinal: index + 1 })}
                  inputMode="decimal"
                  disabled={isDisabled}
                  value={draft.startSeconds}
                  onChange={(event) =>
                    editCut(index, { startSeconds: event.target.value })
                  }
                />
                <Input
                  aria-label={translate('cutEnd', { ordinal: index + 1 })}
                  inputMode="decimal"
                  disabled={isDisabled}
                  value={draft.endSeconds}
                  onChange={(event) =>
                    editCut(index, { endSeconds: event.target.value })
                  }
                />
                <Input
                  aria-label={translate('cutFraming', { ordinal: index + 1 })}
                  placeholder={translate('framingPlaceholder')}
                  maxLength={200}
                  disabled={isDisabled}
                  value={draft.framing}
                  onChange={(event) =>
                    editCut(index, { framing: event.target.value })
                  }
                />
                <Input
                  aria-label={translate('cutCamera', { ordinal: index + 1 })}
                  placeholder={translate('cameraPlaceholder')}
                  maxLength={200}
                  disabled={isDisabled}
                  value={draft.camera}
                  onChange={(event) =>
                    editCut(index, { camera: event.target.value })
                  }
                />
                <Button
                  ariaLabel={translate('removeCut', { ordinal: index + 1 })}
                  icon={<X className="size-4" />}
                  isDisabled={isDisabled}
                  onClick={() => removeCut(index)}
                  size={ButtonSize.ICON}
                  variant={ButtonVariant.GHOST}
                />
              </div>
            ))}
            <Button
              className="self-start"
              icon={<Plus className="size-4" />}
              isDisabled={
                isDisabled || cutDrafts.length >= STORYBOARD_SHOT_LIMITS.maxCuts
              }
              label={translate('addCut')}
              onClick={addCut}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
          </div>

          <Field label={translate('sfx')}>
            <Input
              placeholder={translate('sfxPlaceholder')}
              disabled={isDisabled}
              value={sfxText}
              onChange={(event) => setSfxText(event.target.value)}
              onBlur={commitSfx}
            />
          </Field>

          <div
            aria-label={translate('references')}
            className="flex flex-col gap-2"
            role="group"
          >
            <p className="text-xs font-medium text-foreground">
              {translate('references')}
            </p>
            {(shot.referenceRoles ?? []).map((reference) => {
              const url = referenceUrls[reference.assetId];
              return (
                <div
                  key={reference.assetId}
                  className="grid items-center gap-2 sm:grid-cols-[3rem_minmax(0,12rem)_minmax(0,1fr)_auto]"
                >
                  {url ? (
                    <NextImage
                      alt=""
                      className="size-12 rounded-md object-cover"
                      height={48}
                      src={url}
                      unoptimized
                      width={48}
                    />
                  ) : (
                    <span className="size-12 rounded-md bg-muted" />
                  )}
                  <StoryboardSelect
                    ariaLabel={translate('roleFor', {
                      label: reference.label || reference.assetId,
                    })}
                    isDisabled={isDisabled}
                    onChange={(value) => {
                      const role = STORYBOARD_REFERENCE_ROLES.find(
                        (candidate) => candidate === value,
                      );
                      if (role) editRole(reference.assetId, { role });
                    }}
                    options={roleOptions}
                    placeholder={translate('chooseRole')}
                    value={reference.role}
                  />
                  <Input
                    aria-label={translate('labelFor', {
                      label: reference.label || reference.assetId,
                    })}
                    placeholder={translate('labelPlaceholder')}
                    maxLength={60}
                    disabled={isDisabled}
                    value={reference.label ?? ''}
                    onChange={(event) =>
                      editRole(reference.assetId, {
                        label: event.target.value || undefined,
                      })
                    }
                  />
                  <Button
                    ariaLabel={translate('removeReference', {
                      label: reference.label || reference.assetId,
                    })}
                    icon={<X className="size-4" />}
                    isDisabled={isDisabled}
                    onClick={() => removeRole(reference.assetId)}
                    size={ButtonSize.ICON}
                    variant={ButtonVariant.GHOST}
                  />
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-48">
                <StoryboardSelect
                  ariaLabel={translate('newReferenceRole')}
                  isDisabled={isDisabled}
                  onChange={(value) => {
                    const role = STORYBOARD_REFERENCE_ROLES.find(
                      (candidate) => candidate === value,
                    );
                    if (role) setNewRole(role);
                  }}
                  options={roleOptions}
                  placeholder={translate('chooseRole')}
                  value={newRole}
                />
              </div>
              <Button
                icon={<ImagePlus className="size-4" />}
                isDisabled={
                  isDisabled ||
                  (shot.referenceRoles?.length ?? 0) >=
                    STORYBOARD_SHOT_LIMITS.maxReferenceRoles
                }
                label={translate('addReference')}
                onClick={() => onAddReference(newRole)}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          </div>

          <Field label={translate('prompt')}>
            <Textarea
              aria-describedby={`shot-${shot.id}-prompt-help`}
              disabled={isDisabled}
              maxLength={STORYBOARD_SHOT_LIMITS.maxVideoPromptCharacters}
              rows={4}
              value={shot.videoPrompt ?? compiled?.prompt ?? ''}
              onChange={(event) =>
                onPatch({
                  videoPrompt:
                    event.target.value.trim() &&
                    event.target.value !== compiled?.prompt
                      ? event.target.value
                      : undefined,
                })
              }
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <p id={`shot-${shot.id}-prompt-help`} className="mr-auto">
              {model
                ? translate(
                    shot.videoPrompt ? 'promptCustom' : 'promptCompiled',
                    {
                      model: model.label,
                    },
                  )
                : translate('promptUnavailable')}
            </p>
            {shot.videoPrompt ? (
              <Button
                isDisabled={isDisabled}
                label={translate('useCompiledPrompt')}
                onClick={() => onPatch({ videoPrompt: undefined })}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              />
            ) : null}
          </div>
          {isOverLimit && compiled && model ? (
            <p role="alert" className="text-xs text-destructive">
              {translate('overLimit', {
                count: compiled.namedReferenceCount,
                limit: model.maxReferences ?? 0,
                model: model.label,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
