'use client';

import { useAgentDock } from '@contexts/ui/agent-dock-context';
import { attachContentToNewConversationDraft } from '@genfeedai/agent/stores/conversation-composer-draft.store';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { IngredientContinuationOperation } from '@genfeedai/props/content/masonry.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useIngredientDownloadHandler } from '@ui/masonry/shared/useMasonryHover';
import { Button } from '@ui/primitives/button';
import { buttonVariants } from '@ui/primitives/button.variants';
import {
  Download,
  GitBranch,
  ImagePlus,
  MessageSquare,
  Scissors,
  Send,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactElement, useCallback, useId } from 'react';
import { studioAssetAccessibleLabel } from '@/features/studio/playground/utils/studio-playground-recipe';
import type { StudioInspectorActionsProps } from '@/features/studio/props/studio-playground-inspector.props';

/**
 * What the operator can do with a finished asset: generate again, continue it
 * (edit, vary, animate, upscale, extend, editor), use it as a reference or in
 * a post, download it, or ask the agent about it.
 */
export default function StudioInspectorActions({
  continuationJob,
  ingredient,
  isUseAsReferenceEnabled,
  job,
  label,
  onAnimate,
  onEdit,
  onOpenInEditor,
  onRemix,
  onSelect,
  onUseAsReference,
  onUseInPost,
  onVary,
  parentJob,
  transformActions,
}: StudioInspectorActionsProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const availabilityId = useId();
  const translateAction = useTranslations(
    'common.videoCreativeActions.inspector',
  );
  const downloadIngredient = useIngredientDownloadHandler();
  const { href, orgSlug } = useOrgUrl();
  const { push } = useRouter();
  const agentDock = useAgentDock();

  // The asset rides the agent's attachment tray; nothing is sent until the
  // operator writes the question. The dock hosts it in place; without one the
  // next new conversation on `/agent` picks it up.
  const handleAskAgent = useCallback(() => {
    if (!ingredient) {
      return;
    }

    const reference = {
      ...(ingredient.brandId ? { brandId: ingredient.brandId } : {}),
      contentTitle: job.prompt.trim() || label,
      contentType: job.type,
      id: ingredient.id,
      kind: 'ingredient' as const,
      ...(ingredient.thumbnailUrl
        ? { thumbnailUrl: ingredient.thumbnailUrl }
        : {}),
    };
    if (agentDock?.attachContent(reference)) {
      return;
    }

    attachContentToNewConversationDraft(orgSlug, reference);
    push(href(APP_ROUTES.AGENT.NEW));
  }, [agentDock, href, ingredient, job.prompt, job.type, label, orgSlug, push]);

  const renderContinuationAction = (
    operation: IngredientContinuationOperation,
    actionLabel: string,
    onPrepare: (source: IIngredient) => void | Promise<void>,
  ) => {
    if (!ingredient) return null;
    const availability = transformActions?.getAvailability(
      ingredient,
      operation,
    ) ?? { isAvailable: true };
    const reason =
      !availability.isAvailable && availability.reason
        ? translateAction(`availability.${availability.reason}`)
        : undefined;
    const descriptionId = `${availabilityId}-${operation}`;
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <Button
          className="w-full"
          label={actionLabel}
          onClick={() => {
            void onPrepare(ingredient);
          }}
          isDisabled={!availability.isAvailable}
          aria-describedby={reason ? descriptionId : undefined}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        />
        {reason ? (
          <p className="text-2xs text-muted-foreground" id={descriptionId}>
            {reason}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div
      aria-label={translate('inspector.actions')}
      className="grid shrink-0 grid-cols-2 gap-2 border-t border-border px-4 py-3"
      role="group"
    >
      <Button
        className="w-full"
        icon={<Sparkles className="size-3.5" />}
        label={translateAction('generateAgain')}
        onClick={() => onVary(continuationJob)}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      />
      {ingredient && (job.type === 'image' || job.type === 'image-edit') ? (
        <>
          {onEdit
            ? renderContinuationAction(
                'edit',
                translate('editImage.label'),
                () => onEdit(job),
              )
            : null}
          {renderContinuationAction(
            'variation',
            translateAction('createVariation'),
            () => onRemix(job),
          )}
          {onAnimate
            ? renderContinuationAction(
                'animate',
                translateAction('animate'),
                onAnimate,
              )
            : null}
        </>
      ) : null}
      {ingredient && transformActions ? (
        <>
          {renderContinuationAction(
            'upscale',
            translateAction('upscale'),
            transformActions.onUpscale,
          )}
          {job.type === 'video'
            ? renderContinuationAction(
                'extend',
                translateAction('extend'),
                transformActions.onExtend,
              )
            : null}
        </>
      ) : null}
      {ingredient && job.type === 'video' && onOpenInEditor
        ? renderContinuationAction(
            'editor',
            translateAction('editor'),
            onOpenInEditor,
          )
        : null}
      {onUseAsReference &&
      isUseAsReferenceEnabled !== false &&
      (job.type === 'image' ||
        job.type === 'image-edit' ||
        job.type === 'video' ||
        job.type === 'avatar') ? (
        <Button
          ariaLabel={translate('useAsReferenceAria', {
            prompt: studioAssetAccessibleLabel(job),
            type: label.toLowerCase(),
          })}
          className="w-full"
          icon={<ImagePlus className="size-3.5" />}
          label={translate('useAsReference')}
          onClick={() => onUseAsReference(job)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        />
      ) : null}
      {ingredient && job.type === 'video' ? (
        <Link
          className={buttonVariants({
            className: 'w-full',
            size: ButtonSize.SM,
            variant: ButtonVariant.SECONDARY,
          })}
          href={href(`${APP_ROUTES.STUDIO.CLIPPER}?video=${ingredient.id}`)}
        >
          <Scissors aria-hidden="true" className="size-3.5" />
          {translate('makeClips')}
        </Link>
      ) : null}
      {parentJob ? (
        <Button
          ariaLabel={translate('sourceAssetAria', {
            type: label.toLowerCase(),
          })}
          className="w-full"
          icon={<GitBranch className="size-3.5" />}
          label={translate('sourceAsset')}
          onClick={() => onSelect(parentJob)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        />
      ) : null}
      {ingredient ? (
        <>
          <Button
            className="w-full"
            icon={<Send className="size-3.5" />}
            label={translate('inspector.useInPost')}
            onClick={() => onUseInPost(ingredient)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          />
          <Button
            className="w-full"
            icon={<Download className="size-3.5" />}
            label={translate('inspector.download')}
            onClick={() => void downloadIngredient(ingredient)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          />
          <Button
            className="col-span-2 w-full"
            icon={<MessageSquare className="size-3.5" />}
            label={translate('inspector.askAgent')}
            onClick={handleAskAgent}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </>
      ) : null}
    </div>
  );
}
