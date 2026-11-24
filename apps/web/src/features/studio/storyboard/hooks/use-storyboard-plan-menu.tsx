'use client';

import {
  useConfirmModal,
  useGalleryModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { IngredientCategory } from '@genfeedai/contracts';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { CollectionOverflowAction } from '@props/ui/collection/collection.props';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { Film, ImageIcon, RotateCcw, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

type Perform = (
  action: (revision: number) => Promise<unknown>,
) => Promise<void>;

interface StoryboardPlanMenuInput {
  brandId: string;
  canReset: boolean;
  canUndo: boolean;
  isDisabled: boolean;
  /** Reversing builds shot-by-shot videos, so long-form and slideshow plans have no such action. */
  isReversible: boolean;
  perform: Perform;
  plan: StoryboardPlan;
  resetPlan: (revision: number) => Promise<StoryboardRun>;
  reversePlan?: (revision: number, assetId: string) => Promise<StoryboardRun>;
  undo: () => Promise<unknown>;
}

/**
 * The plan editor's "..." menu: undo, reset to the generated plan, and
 * reverse engineering of a Library video or image into shots (#10578). A video
 * replaces the shots that are written, so that asks first.
 */
export function useStoryboardPlanMenu({
  brandId,
  canReset,
  canUndo,
  isDisabled,
  isReversible,
  perform,
  plan,
  resetPlan,
  reversePlan,
  undo,
}: StoryboardPlanMenuInput): CollectionOverflowAction[] {
  const translate = useTranslations('pages.studioStoryboard.plan');
  const { openConfirm } = useConfirmModal();
  const { openGallery } = useGalleryModal();

  function reset() {
    openConfirm({
      isOpen: true,
      label: translate('resetConfirm'),
      message: translate('resetMessage'),
      confirmLabel: translate('resetPlan'),
      onConfirm: () => perform((revision) => resetPlan(revision)),
    });
  }

  function reverseReference(
    category: IngredientCategory.IMAGE | IngredientCategory.VIDEO,
  ) {
    if (!reversePlan) return;
    const isVideo = category === IngredientCategory.VIDEO;
    openGallery({
      category,
      maxSelectableItems: 1,
      title: translate(isVideo ? 'reverseVideo' : 'reverseImage'),
      onSelect: (selected) => {
        const item = selected.find(
          (candidate) => candidate.brandId === brandId && !candidate.isDeleted,
        );
        if (!item) return;
        const apply = () =>
          perform((revision) =>
            reversePlan(revision, item.id).catch((error: unknown) => {
              throw new Error(
                getJsonApiErrorMessage(error, translate('reverseFailed')),
              );
            }),
          );
        if (!isVideo || !plan.shots.some((shot) => shot.action.length > 0))
          return void apply();
        openConfirm({
          isOpen: true,
          label: translate('reverseConfirm'),
          message: translate('reverseMessage'),
          confirmLabel: translate('reverseVideo'),
          onConfirm: apply,
        });
      },
    });
  }

  return [
    {
      icon: <Undo2 className="size-4" />,
      id: 'undo',
      isDisabled: isDisabled || !canUndo,
      label: translate('undo'),
      onSelect: () => void perform(() => undo()),
    },
    {
      icon: <RotateCcw className="size-4" />,
      id: 'reset-plan',
      isDisabled: isDisabled || !canReset,
      label: translate('resetPlan'),
      onSelect: reset,
    },
    ...(reversePlan && isReversible
      ? [
          {
            icon: <Film className="size-4" />,
            id: 'reverse-video',
            isDisabled,
            label: translate('reverseVideo'),
            onSelect: () => reverseReference(IngredientCategory.VIDEO),
          },
          {
            icon: <ImageIcon className="size-4" />,
            id: 'reverse-image',
            isDisabled,
            label: translate('reverseImage'),
            onSelect: () => reverseReference(IngredientCategory.IMAGE),
          },
        ]
      : []),
  ];
}
