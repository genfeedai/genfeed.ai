'use client';

import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
  CardVariant,
} from '@genfeedai/contracts';
import type {
  StoryboardARollChunk,
  StoryboardARollQuote,
  StoryboardLongFormEstimate,
  StoryboardPresenterTrack,
} from '@genfeedai/contracts/api-types/contracts/storyboard-a-roll.contract';
import {
  STORYBOARD_TRANSLATION_LANGUAGES,
  type StoryboardTranslationLanguage,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardStillQuote } from '@genfeedai/contracts/api-types/contracts/storyboard-still.contract';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import GenerationStatus from '@ui/feedback/generation-status/GenerationStatus';
import { Button } from '@ui/primitives/button';
import { EditableText } from '@ui/primitives/editable-text';
import Field from '@ui/primitives/field';
import { SelectField } from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { StoryboardLongFormBoardProps } from '@/features/studio/props/storyboard.props';
import { formatStoryboardTimecode } from '@/features/studio/storyboard/utils/storyboard-runtime';

interface TrackProgress {
  total: number;
  ready: number;
  failed: number;
  isLive: boolean;
}

function trackProgress(
  chunks: readonly StoryboardARollChunk[] | undefined,
): TrackProgress {
  const list = chunks ?? [];
  return {
    total: list.length,
    ready: list.filter((chunk) => chunk.state === 'ready').length,
    failed: list.filter((chunk) => chunk.state === 'failed').length,
    isLive: list.some(
      (chunk) => chunk.state === 'pending' || chunk.state === 'submitted',
    ),
  };
}

/**
 * A long-form storyboard (#8218): the script as narration segments with
 * their B-roll, then the steps that turn it into a video. Every paid step is
 * priced first; the presenter render waits for an explicit confirmation.
 */
export default function StoryboardLongFormBoard({
  run,
  segments,
  isApproved,
  isDisabled,
  cutawayStills,
  onPatchSegment,
  onPatchCutaway,
  onPerform,
  actions,
}: StoryboardLongFormBoardProps) {
  const translate = useTranslations('pages.studioStoryboard.longForm');
  const locale = useLocale();
  const languageNames = useMemo(
    () => new Intl.DisplayNames([locale], { type: 'language' }),
    [locale],
  );
  const [language, setLanguage] = useState<StoryboardTranslationLanguage>(
    STORYBOARD_TRANSLATION_LANGUAGES[1],
  );
  const { openConfirm } = useConfirmModal();
  const { href } = useOrgUrl();
  const router = useRouter();
  const cutaways = segments.flatMap((segment) => segment.cutaways);
  const missingCutaways = cutaways.filter((cutaway) => !cutaway.assetId);
  const animatic = trackProgress(run.config.animatic?.chunks);
  const presenter = trackProgress(run.config.aRoll?.chunks);
  const isBusy = isDisabled || !actions;
  const estimateLongForm = actions?.estimateLongForm;
  const revision = run.config.revision;
  const [estimate, setEstimate] = useState<StoryboardLongFormEstimate>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-price whenever the script or a finished part changes what is left; part renders do not bump the revision.
  useEffect(() => {
    if (!estimateLongForm) return;
    const controller = new AbortController();
    estimateLongForm(revision, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setEstimate(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEstimate(undefined);
      });
    return () => controller.abort();
  }, [
    estimateLongForm,
    revision,
    missingCutaways.length,
    animatic.ready,
    presenter.ready,
  ]);

  function price(quote: StoryboardStillQuote | StoryboardARollQuote) {
    return quote.billingMode === 'byok'
      ? translate('priceByok')
      : translate('priceCredits', { credits: quote.total });
  }
  function drawCutaways() {
    if (!actions) return;
    onPerform(async (revision) => {
      const quote = await actions.quoteCutaways(revision);
      NotificationsService.getInstance().info(
        translate('cutawayQuote', {
          count: quote.items.length,
          price: price(quote),
        }),
      );
      await actions.generateCutaways(quote);
    });
  }
  function draftAnimatic() {
    if (!actions) return;
    onPerform(async () => {
      const quote = await actions.quotePresenter('animatic');
      NotificationsService.getInstance().info(
        translate('animaticQuote', {
          count: quote.items.length,
          price: price(quote),
        }),
      );
      await actions.renderPresenter('animatic', quote);
    });
  }
  function renderPresenter() {
    if (!actions) return;
    onPerform(async () => {
      const quote = await actions.quotePresenter('aRoll');
      const seconds = Math.round(
        quote.items.reduce((sum, item) => sum + item.estimatedSeconds, 0),
      );
      openConfirm({
        isOpen: true,
        label: translate('presenterConfirmTitle'),
        message: translate('presenterConfirmMessage', {
          count: quote.items.length,
          duration: formatStoryboardTimecode(seconds),
          price: price(quote),
        }),
        confirmLabel: translate('presenterConfirm'),
        onConfirm: () =>
          onPerform(() => actions.renderPresenter('aRoll', quote)),
      });
    });
  }
  function makeTranslation() {
    if (!actions) return;
    onPerform(async (revision) => {
      const copy = await actions.translateLongForm(revision, language);
      NotificationsService.getInstance().success(
        translate('translateDone', {
          language: languageNames.of(language) ?? language,
        }),
      );
      router.push(
        href(`${APP_ROUTES.STUDIO.STORYBOARD}/${encodeURIComponent(copy.id)}`),
      );
    });
  }
  function openEdit(track: StoryboardPresenterTrack) {
    if (!actions) return;
    onPerform(async () => {
      const { editorProjectId, skippedCutawayIds } =
        await actions.assembleLongForm(track);
      if (skippedCutawayIds.length)
        NotificationsService.getInstance().warning(
          translate('cutawaysSkipped', { count: skippedCutawayIds.length }),
        );
      router.push(
        href(
          `${APP_ROUTES.STUDIO.EDITOR}/${encodeURIComponent(editorProjectId)}`,
        ),
      );
    });
  }

  let elapsed = 0;
  return (
    <div className="flex flex-col gap-4">
      <Card variant={CardVariant.BORDERED}>
        <h2 className="text-sm font-semibold">
          {translate('productionTitle')}
        </h2>
        {estimate ? (
          <p className="text-sm text-muted-foreground">
            {estimate.billingMode === 'byok'
              ? translate('estimateByok')
              : translate('estimateCredits', {
                  credits: estimate.totalCredits,
                })}
            {estimate.presenter.problem ? ` ${estimate.presenter.problem}` : ''}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <section
            aria-label={translate('brollTitle')}
            className="flex flex-col gap-2 rounded-md border border-border p-3"
          >
            <p className="text-sm font-medium">{translate('brollTitle')}</p>
            <p className="text-xs text-muted-foreground">
              {translate('brollProgress', {
                ready: cutaways.length - missingCutaways.length,
                total: cutaways.length,
              })}
            </p>
            {actions?.isDrawingCutaways ? (
              <GenerationStatus
                status="generating"
                label={translate('brollDrawing')}
                compact
              />
            ) : null}
            <Button
              label={translate('brollDraw')}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              disabled={
                isBusy ||
                actions?.isDrawingCutaways ||
                missingCutaways.length === 0
              }
              onClick={drawCutaways}
            />
          </section>
          <section
            aria-label={translate('animaticTitle')}
            className="flex flex-col gap-2 rounded-md border border-border p-3"
          >
            <p className="text-sm font-medium">{translate('animaticTitle')}</p>
            <p className="text-xs text-muted-foreground">
              {animatic.total
                ? translate('trackProgress', {
                    ready: animatic.ready,
                    total: animatic.total,
                    failed: animatic.failed,
                  })
                : translate('animaticHint')}
            </p>
            {animatic.isLive ? (
              <GenerationStatus
                status="generating"
                label={translate('animaticDrafting')}
                compact
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                label={translate('animaticDraft')}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                disabled={isBusy || animatic.isLive || segments.length === 0}
                onClick={draftAnimatic}
              />
              <Button
                label={translate('animaticOpen')}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                disabled={
                  isBusy ||
                  animatic.total === 0 ||
                  animatic.ready !== animatic.total
                }
                onClick={() => openEdit('animatic')}
              />
            </div>
          </section>
          <section
            aria-label={translate('presenterTitle')}
            className="flex flex-col gap-2 rounded-md border border-border p-3"
          >
            <p className="text-sm font-medium">{translate('presenterTitle')}</p>
            <p className="text-xs text-muted-foreground">
              {!isApproved
                ? translate('presenterNeedsApproval')
                : presenter.total
                  ? translate('trackProgress', {
                      ready: presenter.ready,
                      total: presenter.total,
                      failed: presenter.failed,
                    })
                  : translate('presenterHint')}
            </p>
            {presenter.isLive ? (
              <GenerationStatus
                status="generating"
                label={translate('presenterRendering')}
                compact
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                label={translate('presenterRender')}
                size={ButtonSize.SM}
                disabled={isBusy || !isApproved || presenter.isLive}
                onClick={renderPresenter}
              />
              <Button
                label={translate('finalOpen')}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                disabled={
                  isBusy ||
                  presenter.total === 0 ||
                  presenter.ready !== presenter.total
                }
                onClick={() => openEdit('aRoll')}
              />
            </div>
          </section>
        </div>
        <section
          aria-label={translate('translateTitle')}
          className="flex flex-col gap-2 rounded-md border border-border p-3"
        >
          <p className="text-sm font-medium">{translate('translateTitle')}</p>
          <p className="text-xs text-muted-foreground">
            {translate('translateHint')}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <SelectField
              name="storyboard-translation-language"
              label={translate('translateLanguage')}
              value={language}
              isDisabled={isBusy}
              isFullWidth={false}
              onChange={(event) => {
                const next = STORYBOARD_TRANSLATION_LANGUAGES.find(
                  (code) => code === event.target.value,
                );
                if (next) setLanguage(next);
              }}
            >
              {STORYBOARD_TRANSLATION_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {languageNames.of(code) ?? code}
                </option>
              ))}
            </SelectField>
            <Button
              label={translate('translateStart')}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              disabled={isBusy || segments.length === 0}
              onClick={makeTranslation}
            />
          </div>
        </section>
      </Card>
      {segments.map((segment) => {
        const start = elapsed;
        elapsed += segment.estimatedSeconds;
        return (
          <section
            key={segment.id}
            id={`segment-${segment.id}`}
            aria-label={translate('segment', { ordinal: segment.ordinal })}
          >
            <Card
              variant={CardVariant.BORDERED}
              padding={CardPadding.NONE}
              gap={CardGap.NONE}
            >
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
                <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {String(segment.ordinal).padStart(2, '0')}
                </span>
                <EditableText
                  ariaLabel={translate('segmentNameFor', {
                    ordinal: segment.ordinal,
                  })}
                  className="min-w-0 flex-1"
                  displayClassName="text-sm font-semibold"
                  isDisabled={isDisabled}
                  maxLength={40}
                  onSave={(value) =>
                    onPatchSegment(segment.id, { sectionLabel: value })
                  }
                  placeholder={translate('segmentNamePlaceholder')}
                  value={segment.sectionLabel ?? ''}
                />
                <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                  {formatStoryboardTimecode(start)}–
                  {formatStoryboardTimecode(elapsed)}
                </span>
              </div>
              <div className="flex flex-col gap-3 p-4">
                <Field label={translate('narration')}>
                  <Textarea
                    value={segment.narration}
                    maxLength={2000}
                    disabled={isDisabled}
                    onChange={(event) =>
                      onPatchSegment(segment.id, {
                        narration: event.target.value,
                      })
                    }
                  />
                </Field>
                {segment.cutaways.length ? (
                  <ul
                    aria-label={translate('cutaways')}
                    className="flex flex-col gap-2"
                  >
                    {segment.cutaways.map((cutaway) => {
                      const still = cutaway.assetId
                        ? cutawayStills[cutaway.assetId]
                        : undefined;
                      return (
                        <li
                          key={cutaway.id}
                          className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[6rem_minmax(0,1fr)]"
                        >
                          {still ? (
                            <AgentMediaArtifactPreview
                              assets={[
                                {
                                  kind: 'image',
                                  url: still,
                                  title: cutaway.brief,
                                  alt: cutaway.brief,
                                },
                              ]}
                            />
                          ) : (
                            <p className="flex aspect-video items-center justify-center rounded-md border border-dashed border-border text-center text-xs text-muted-foreground">
                              {translate('noFootage')}
                            </p>
                          )}
                          <div className="flex min-w-0 flex-col gap-2">
                            <p className="text-xs text-muted-foreground">
                              {translate(`kinds.${cutaway.kind}`)} ·{' '}
                              {translate('cutawayTiming', {
                                at: formatStoryboardTimecode(
                                  start + cutaway.startSeconds,
                                ),
                                seconds: Math.round(cutaway.durationSeconds),
                              })}
                            </p>
                            <Textarea
                              aria-label={translate('cutawayBrief')}
                              value={cutaway.brief}
                              maxLength={1000}
                              disabled={isDisabled}
                              onChange={(event) =>
                                onPatchCutaway(cutaway.id, {
                                  brief: event.target.value,
                                })
                              }
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
