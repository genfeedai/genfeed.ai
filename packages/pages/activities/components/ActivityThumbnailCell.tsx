'use client';

import { ButtonVariant, IngredientCategory } from '@genfeedai/contracts';
import type {
  IActivity,
  IActivityPopulated,
} from '@genfeedai/contracts/interfaces';
import {
  getActivityMediaPreviewUrl,
  getActivityTypeKind,
} from '@pages/activities/activities-list.utils';
import { Button } from '@ui/primitives/button';
import {
  Coins,
  Eye,
  FileText,
  Image as ImageIcon,
  Music,
  Play,
  Sparkles,
  Unplug,
  Video,
  Workflow,
} from 'lucide-react';
import Image from 'next/image';
import { type ReactNode, useState } from 'react';

type Props = {
  activity: IActivity;
  isBackgroundTask: boolean;
  status: 'processing' | 'completed' | 'failed' | 'pending';
  resultType: IngredientCategory | undefined;
  parsedMediaUrl: string | undefined;
  resultId: string | undefined;
  getPreviewUrl: (
    ingredient: Record<string, unknown>,
    category: IngredientCategory,
  ) => string | undefined;
  onViewIngredient: (ingredient: unknown) => void;
};

/** Both inspect controls are icon-only, so the name lives on the button. */
const INSPECT_LABEL = 'Inspect activity ingredient';

function ActivityTypeIcon({ activity }: { activity: IActivity }) {
  const TypeIcon = {
    article: FileText,
    audio: Music,
    credits: Coins,
    image: ImageIcon,
    other: Sparkles,
    post: FileText,
    social: Unplug,
    video: Video,
    workflow: Workflow,
  }[getActivityTypeKind(activity)];

  return (
    <div className="flex size-10 shrink-0 items-center justify-center bg-background-secondary text-foreground/70">
      <TypeIcon aria-hidden="true" className="size-4" />
    </div>
  );
}

function ActivityAssetPreview({
  activity,
  fallback,
  ingredient,
  onViewIngredient,
  resultType,
  src,
}: {
  activity: IActivity;
  fallback: ReactNode;
  ingredient: unknown;
  onViewIngredient: (ingredient: unknown) => void;
  resultType: IngredientCategory | undefined;
  src: string;
}) {
  // Rows are keyed by activity id, so this stays mounted across a refetch that
  // swaps in a new preview URL. Remember which URL failed rather than latching
  // a boolean that would hide the replacement image too.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) {
    return fallback;
  }

  const canInspect = Boolean(ingredient);
  const isVideo = resultType === IngredientCategory.VIDEO;

  return (
    <div className="group relative size-10 shrink-0 overflow-hidden bg-background">
      <Image
        src={src}
        alt={activity.label || 'Activity asset'}
        fill
        className="object-cover"
        sizes="48px"
        unoptimized
        onError={() => setFailedSrc(src)}
      />
      {isVideo ? (
        <div
          className={
            'absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/50 transition-colors' /* design-system-allow-content-color */
          }
        >
          <Play
            className={
              'size-4 text-white group-hover:hidden' /* design-system-allow-content-color */
            }
          />
          {canInspect ? (
            <Eye
              className={
                'size-5 text-white hidden group-hover:block' /* design-system-allow-content-color */
              }
            />
          ) : null}
        </div>
      ) : null}
      {canInspect && !isVideo ? (
        <Button
          ariaLabel={INSPECT_LABEL}
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          onClick={(event) => {
            event.stopPropagation();
            onViewIngredient(ingredient);
          }}
          className={
            'absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary' /* design-system-allow-content-color */
          }
        >
          <Eye
            className={
              'size-5 text-white' /* design-system-allow-content-color */
            }
          />
        </Button>
      ) : null}
      {canInspect && isVideo ? (
        <Button
          ariaLabel={INSPECT_LABEL}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={(event) => {
            event.stopPropagation();
            onViewIngredient(ingredient);
          }}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        />
      ) : null}
    </div>
  );
}

export default function ActivityThumbnailCell({
  activity,
  status,
  resultType,
  parsedMediaUrl,
  resultId,
  getPreviewUrl,
  onViewIngredient,
}: Props) {
  const previewUrl = getActivityMediaPreviewUrl(activity, {
    getPreviewUrl,
    parsedMediaUrl,
    resultId,
    resultType,
    status,
  });
  const ingredient = (activity as IActivityPopulated).ingredient;
  const fallback = <ActivityTypeIcon activity={activity} />;

  if (!previewUrl) {
    return fallback;
  }

  return (
    <ActivityAssetPreview
      activity={activity}
      fallback={fallback}
      ingredient={ingredient}
      onViewIngredient={onViewIngredient}
      resultType={resultType}
      src={previewUrl}
    />
  );
}
