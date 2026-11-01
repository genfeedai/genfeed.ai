'use client';

import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
import {
  ButtonSize,
  ButtonVariant,
  CardPadding,
  CardVariant,
} from '@genfeedai/contracts';
import { STORYBOARD_SLIDESHOW_LIMITS } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import GenerationStatus from '@ui/feedback/generation-status/GenerationStatus';
import { Button } from '@ui/primitives/button';
import { EditableText } from '@ui/primitives/editable-text';
import Field from '@ui/primitives/field';
import { Textarea } from '@ui/primitives/textarea';
import { ArrowLeft, ArrowRight, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { StoryboardSlideshowBoardProps } from '@/features/studio/props/storyboard.props';

const SLIDE_ASPECT_CLASSES = {
  '1:1': 'aspect-square',
  '16:9': 'aspect-video',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
} as const;

/**
 * A slideshow storyboard (#8896): the slides in swipe order, each with its
 * image, description and name. Drawing the images is priced first; saving the
 * approved set makes one draft post and never schedules or publishes it.
 */
export default function StoryboardSlideshowBoard({
  slides,
  format,
  isApproved,
  isDisabled,
  slideImages,
  onPatchSlide,
  onMoveSlide,
  onRemoveSlide,
  onAddSlide,
  onDrawImages,
  onPerform,
  actions,
}: StoryboardSlideshowBoardProps) {
  const translate = useTranslations('pages.studioStoryboard.slideshow');
  const { href } = useOrgUrl();
  const router = useRouter();
  const { maxSlides } = STORYBOARD_SLIDESHOW_LIMITS;
  const ready = slides.filter(
    (slide) => slide.stillFreshness === 'fresh' && slide.stillAssetId,
  ).length;
  const isDrawing = slides.some(
    (slide) => slide.stillFreshness === 'generating',
  );
  const isFull = slides.length >= maxSlides;

  function savePost() {
    if (!actions) return;
    onPerform(async (revision) => {
      const post = await actions.createPost(revision);
      const notifications = NotificationsService.getInstance();
      if (post.isExisting) notifications.info(translate('postExisting'));
      else
        notifications.success(
          translate('postSaved', { count: post.slideCount }),
        );
      router.push(
        href(
          `${APP_ROUTES.PUBLISHING.POSTS}/${encodeURIComponent(post.postId)}`,
        ),
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card variant={CardVariant.BORDERED}>
        <h2 className="text-sm font-semibold">{translate('title')}</h2>
        <p className="text-sm text-muted-foreground">
          {translate('swipeHint')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm">
            {translate('progress', { ready, total: slides.length })}
          </p>
          {isDrawing ? (
            <GenerationStatus
              status="generating"
              label={translate('drawing')}
              compact
            />
          ) : null}
          <Button
            label={translate('drawMissing')}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            disabled={isDisabled || isDrawing || ready === slides.length}
            onClick={() => onDrawImages()}
          />
        </div>
      </Card>
      <ul
        aria-label={translate('title')}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {slides.map((slide, index) => {
          const url = slide.stillAssetId
            ? slideImages[slide.stillAssetId]
            : undefined;
          const isSlideDrawing = slide.stillFreshness === 'generating';
          return (
            <li key={slide.id}>
              <Card variant={CardVariant.BORDERED} padding={CardPadding.SM}>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                    {String(slide.ordinal).padStart(2, '0')}
                  </span>
                  <EditableText
                    ariaLabel={translate('slideNameFor', {
                      ordinal: slide.ordinal,
                    })}
                    className="min-w-0 flex-1"
                    displayClassName="text-sm font-semibold"
                    isDisabled={isDisabled}
                    maxLength={40}
                    onSave={(value) =>
                      onPatchSlide(slide.id, { sectionLabel: value })
                    }
                    placeholder={translate('slideNamePlaceholder')}
                    value={slide.sectionLabel ?? ''}
                  />
                </div>
                {isSlideDrawing ? (
                  <Card
                    aria-busy="true"
                    variant={CardVariant.INSET}
                    padding={CardPadding.SM}
                    className={SLIDE_ASPECT_CLASSES[format]}
                    bodyClassName="items-center justify-center"
                  >
                    <GenerationStatus
                      status="generating"
                      label={translate('imageGenerating')}
                      compact
                      isStacked
                    />
                  </Card>
                ) : url ? (
                  <AgentMediaArtifactPreview
                    displayMode="featured"
                    assets={[
                      {
                        kind: 'image',
                        url,
                        title: slide.sectionLabel ?? '',
                        alt: translate('imageAlt', { ordinal: slide.ordinal }),
                      },
                    ]}
                  />
                ) : (
                  <p
                    className={cn(
                      'flex items-center justify-center rounded-md border border-dashed border-border p-2 text-center text-xs text-muted-foreground',
                      SLIDE_ASPECT_CLASSES[format],
                    )}
                  >
                    {translate('noImage')}
                  </p>
                )}
                {slide.stillFreshness === 'failed' ? (
                  <GenerationStatus
                    status="failed"
                    label={translate('imageFailed')}
                    compact
                  />
                ) : slide.stillFreshness === 'stale' ? (
                  <p role="status" className="text-xs text-muted-foreground">
                    {translate('imageStale')}
                  </p>
                ) : null}
                <Field label={translate('description')}>
                  <Textarea
                    value={slide.action}
                    maxLength={1000}
                    disabled={isDisabled}
                    onChange={(event) =>
                      onPatchSlide(slide.id, { action: event.target.value })
                    }
                  />
                </Field>
                <div className="flex items-center gap-1">
                  <Button
                    ariaLabel={translate('moveEarlier', {
                      ordinal: slide.ordinal,
                    })}
                    icon={<ArrowLeft className="size-4" />}
                    isDisabled={isDisabled || index === 0}
                    onClick={() => onMoveSlide(slide.id, -1)}
                    size={ButtonSize.ICON}
                    tooltip={translate('moveEarlier', {
                      ordinal: slide.ordinal,
                    })}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                  <Button
                    ariaLabel={translate('moveLater', {
                      ordinal: slide.ordinal,
                    })}
                    icon={<ArrowRight className="size-4" />}
                    isDisabled={isDisabled || index === slides.length - 1}
                    onClick={() => onMoveSlide(slide.id, 1)}
                    size={ButtonSize.ICON}
                    tooltip={translate('moveLater', {
                      ordinal: slide.ordinal,
                    })}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                  <Button
                    className="ml-auto"
                    label={
                      slide.stillAssetId
                        ? translate('redrawImage')
                        : translate('drawImage')
                    }
                    icon={<ImagePlus className="size-4" />}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                    disabled={
                      isDisabled || isSlideDrawing || !slide.action.trim()
                    }
                    onClick={() => onDrawImages([slide.id])}
                  />
                  <Button
                    ariaLabel={translate('remove', { ordinal: slide.ordinal })}
                    icon={<Trash2 className="size-4" />}
                    isDisabled={isDisabled}
                    onClick={() => onRemoveSlide(slide.id)}
                    size={ButtonSize.ICON}
                    tooltip={translate('remove', { ordinal: slide.ordinal })}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  />
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <Button
        className="self-center"
        label={translate('addSlide')}
        icon={<Plus className="size-4" />}
        variant={ButtonVariant.SECONDARY}
        disabled={isDisabled || isFull}
        tooltip={isFull ? translate('maxSlides') : undefined}
        onClick={onAddSlide}
      />
      <Card variant={CardVariant.BORDERED}>
        <h2 className="text-sm font-semibold">{translate('postTitle')}</h2>
        <p className="text-sm text-muted-foreground">
          {isApproved ? translate('postHint') : translate('postNeedsApproval')}
        </p>
        <div>
          <Button
            label={translate('postSave')}
            disabled={isDisabled || !isApproved || !actions}
            onClick={savePost}
          />
        </div>
      </Card>
    </div>
  );
}
