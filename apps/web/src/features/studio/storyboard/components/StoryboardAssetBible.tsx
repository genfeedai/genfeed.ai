'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  STORYBOARD_ASSET_BIBLE_LIMITS,
  STORYBOARD_ASSET_KINDS,
  type StoryboardAssetEntry,
  type StoryboardAssetKind,
} from '@genfeedai/contracts/api-types/contracts/storyboard-asset-bible.contract';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { Check, ImagePlus, Plus, Sparkles, X } from 'lucide-react';
import NextImage from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { StoryboardAssetBibleProps } from '@/features/studio/props/storyboard.props';
import StoryboardSelect from '@/features/studio/storyboard/components/StoryboardSelect';

const KIND_LABELS = {
  character_face: 'kindFace',
  character_body: 'kindBody',
  prop: 'kindProp',
  environment: 'kindEnvironment',
} as const satisfies Record<StoryboardAssetKind, string>;

const VARIANT_COUNTS = ['1', '2', '3', '4'] as const;

function isCharacter(kind: StoryboardAssetKind) {
  return kind === 'character_face' || kind === 'character_body';
}

/**
 * The asset bible (#9616): the faces, bodies and costumes, props and places
 * a realistic video is made from. Each entry keeps its candidate images and
 * the one chosen; the chosen face and body of a cast member go to every shot
 * they appear in.
 */
export default function StoryboardAssetBible({
  plan,
  generations,
  imageUrls,
  isDisabled,
  canGenerate,
  onChange,
  onAddSources,
  onGenerate,
}: StoryboardAssetBibleProps) {
  const translate = useTranslations('pages.studioStoryboard.assets');
  const entries = plan.assetBible ?? [];
  const [newKind, setNewKind] = useState<StoryboardAssetKind>('character_body');
  const [newLabel, setNewLabel] = useState('');
  const [newCastId, setNewCastId] = useState<string>();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [angles, setAngles] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const kindOptions = STORYBOARD_ASSET_KINDS.map((kind) => ({
    value: kind,
    label: translate(KIND_LABELS[kind]),
  }));
  const castOptions = plan.cast.map((member) => ({
    value: member.id,
    label: member.name,
  }));

  function update(id: string, patch: Partial<StoryboardAssetEntry>) {
    onChange(
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function add() {
    const label = newLabel.trim();
    if (!label) return;
    onChange([
      ...entries,
      {
        id: crypto.randomUUID(),
        kind: newKind,
        label,
        ...(isCharacter(newKind) && newCastId
          ? { castMemberId: newCastId }
          : {}),
        sourceAssetIds: [],
        variantAssetIds: [],
        ...(newKind === 'character_body'
          ? { sheetEnvironment: 'outdoor' as const }
          : {}),
      },
    ]);
    setNewLabel('');
  }

  return (
    <section aria-label={translate('title')} className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{translate('help')}</p>
      {entries.map((entry) => {
        const generating =
          generations?.filter(
            (item) =>
              item.entryId === entry.id &&
              (item.state === 'pending' || item.state === 'submitted'),
          ).length ?? 0;
        const isBusy = isDisabled || generating > 0;
        const images = [
          ...entry.sourceAssetIds.map((id) => ({ id, isSource: true })),
          ...entry.variantAssetIds.map((id) => ({ id, isSource: false })),
        ];
        return (
          <article
            aria-label={entry.label}
            className="flex flex-col gap-3 rounded-lg border border-border p-3"
            key={entry.id}
          >
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {translate(KIND_LABELS[entry.kind])}
              </Badge>
              <Input
                aria-label={translate('labelFor', { label: entry.label })}
                className="flex-1"
                disabled={isDisabled}
                maxLength={60}
                value={entry.label}
                onChange={(event) =>
                  update(entry.id, { label: event.target.value || entry.label })
                }
              />
              <Button
                ariaLabel={translate('remove', { label: entry.label })}
                icon={<X className="size-4" />}
                isDisabled={isBusy}
                onClick={() =>
                  onChange(entries.filter((item) => item.id !== entry.id))
                }
                size={ButtonSize.ICON}
                variant={ButtonVariant.GHOST}
              />
            </div>
            {isCharacter(entry.kind) ? (
              <StoryboardSelect
                ariaLabel={translate('castFor', { label: entry.label })}
                isDisabled={isDisabled}
                onChange={(value) =>
                  update(entry.id, { castMemberId: value || undefined })
                }
                options={castOptions}
                placeholder={translate('chooseCast')}
                value={entry.castMemberId}
              />
            ) : null}
            <Textarea
              aria-label={translate('briefFor', { label: entry.label })}
              disabled={isDisabled}
              maxLength={1_000}
              placeholder={translate(`briefPlaceholder.${entry.kind}`)}
              rows={2}
              value={entry.brief ?? ''}
              onChange={(event) =>
                update(entry.id, { brief: event.target.value || undefined })
              }
            />
            {entry.kind === 'character_body' ? (
              <StoryboardSelect
                ariaLabel={translate('sheetFor', { label: entry.label })}
                isDisabled={isDisabled}
                onChange={(value) =>
                  update(entry.id, {
                    sheetEnvironment:
                      value === 'neutral' ? 'neutral' : 'outdoor',
                  })
                }
                options={[
                  { value: 'outdoor', label: translate('sheetOutdoor') },
                  { value: 'neutral', label: translate('sheetNeutral') },
                ]}
                placeholder={translate('sheetOutdoor')}
                value={entry.sheetEnvironment ?? 'outdoor'}
              />
            ) : null}
            <div
              aria-label={translate('imagesFor', { label: entry.label })}
              className="flex flex-wrap gap-2"
              role="group"
            >
              {images.map(({ id, isSource }) => {
                const isChosen = entry.chosenAssetId === id;
                const label = translate(isSource ? 'sourceImage' : 'variant', {
                  label: entry.label,
                });
                return (
                  <Button
                    ariaLabel={
                      isChosen
                        ? translate('chosen', { label })
                        : translate('choose', { label })
                    }
                    aria-pressed={isChosen}
                    className="relative shrink-0"
                    isDisabled={isDisabled}
                    key={id}
                    onClick={() => update(entry.id, { chosenAssetId: id })}
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                  >
                    {imageUrls[id] ? (
                      <NextImage
                        alt={label}
                        className={`size-16 rounded-md object-cover ${isChosen ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}
                        height={64}
                        src={imageUrls[id]}
                        unoptimized
                        width={64}
                      />
                    ) : (
                      <span
                        className={`block size-16 rounded-md bg-muted ${isChosen ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}
                      />
                    )}
                    {isChosen ? (
                      <Check className="absolute right-1 top-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
                    ) : null}
                  </Button>
                );
              })}
              {generating ? (
                <p className="self-center text-xs text-muted-foreground">
                  {translate('generating', { count: generating })}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                icon={<ImagePlus className="size-4" />}
                isDisabled={
                  isDisabled ||
                  entry.sourceAssetIds.length >=
                    STORYBOARD_ASSET_BIBLE_LIMITS.maxSources
                }
                label={translate(
                  isCharacter(entry.kind) ? 'addPhotos' : 'addReferences',
                )}
                onClick={() => onAddSources(entry.id)}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
            {canGenerate ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-20">
                    <StoryboardSelect
                      ariaLabel={translate('countFor', { label: entry.label })}
                      isDisabled={isBusy}
                      onChange={(value) =>
                        setCounts((current) => ({
                          ...current,
                          [entry.id]: value ?? '2',
                        }))
                      }
                      options={VARIANT_COUNTS.map((value) => ({
                        value,
                        label: value,
                      }))}
                      placeholder="2"
                      value={counts[entry.id] ?? '2'}
                    />
                  </div>
                  <Button
                    icon={<Sparkles className="size-4" />}
                    isDisabled={isBusy}
                    label={translate('generateVariants')}
                    onClick={() =>
                      onGenerate({
                        entryId: entry.id,
                        action: 'variants',
                        count: Number(counts[entry.id] ?? '2'),
                      })
                    }
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  />
                  {entry.kind === 'character_body' ? (
                    <Button
                      isDisabled={isBusy || !entry.chosenAssetId}
                      label={translate('costumeSwap')}
                      onClick={() =>
                        onGenerate({ entryId: entry.id, action: 'costume' })
                      }
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                    />
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={translate('anglesFor', { label: entry.label })}
                    disabled={isBusy || !entry.chosenAssetId}
                    placeholder={translate('anglesPlaceholder')}
                    value={angles[entry.id] ?? ''}
                    onChange={(event) =>
                      setAngles((current) => ({
                        ...current,
                        [entry.id]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    isDisabled={
                      isBusy ||
                      !entry.chosenAssetId ||
                      !angles[entry.id]?.trim()
                    }
                    label={translate('moreAngles')}
                    onClick={() =>
                      onGenerate({
                        entryId: entry.id,
                        action: 'angles',
                        angles: (angles[entry.id] ?? '')
                          .split(',')
                          .map((angle) => angle.trim())
                          .filter(Boolean)
                          .slice(0, STORYBOARD_ASSET_BIBLE_LIMITS.maxAngles),
                      })
                    }
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  />
                </div>
                {entry.kind === 'environment' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={translate('editFor', { label: entry.label })}
                      disabled={isBusy || !entry.chosenAssetId}
                      maxLength={1_000}
                      placeholder={translate('editPlaceholder')}
                      value={edits[entry.id] ?? ''}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [entry.id]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      isDisabled={
                        isBusy ||
                        !entry.chosenAssetId ||
                        !edits[entry.id]?.trim()
                      }
                      label={translate('edit')}
                      onClick={() =>
                        onGenerate({
                          entryId: entry.id,
                          action: 'edit',
                          instruction: edits[entry.id]?.trim(),
                        })
                      }
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
          <StoryboardSelect
            ariaLabel={translate('newKind')}
            isDisabled={isDisabled}
            onChange={(value) => {
              const kind = STORYBOARD_ASSET_KINDS.find(
                (candidate) => candidate === value,
              );
              if (kind) setNewKind(kind);
            }}
            options={kindOptions}
            placeholder={translate('newKind')}
            value={newKind}
          />
          <Input
            aria-label={translate('newLabel')}
            disabled={isDisabled}
            maxLength={60}
            placeholder={translate('newLabelPlaceholder')}
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
          />
        </div>
        {isCharacter(newKind) && castOptions.length ? (
          <StoryboardSelect
            ariaLabel={translate('newCast')}
            isDisabled={isDisabled}
            onChange={(value) => setNewCastId(value || undefined)}
            options={castOptions}
            placeholder={translate('chooseCast')}
            value={newCastId}
          />
        ) : null}
        <Button
          icon={<Plus className="size-4" />}
          isDisabled={
            isDisabled ||
            !newLabel.trim() ||
            entries.length >= STORYBOARD_ASSET_BIBLE_LIMITS.maxEntries
          }
          label={translate('add')}
          onClick={add}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    </section>
  );
}
