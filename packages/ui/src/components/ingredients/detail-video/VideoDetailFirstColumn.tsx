'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IIngredient, IVideo } from '@genfeedai/interfaces';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import LoadingOverlay from '@ui/loading/overlay/LoadingOverlay';
import { Button } from '@ui/primitives/button';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import Link from 'next/link';
import type { ReactNode, RefObject } from 'react';
import { HiOutlineFilm } from 'react-icons/hi2';

type VideoDetailFirstColumnProps = {
  currentVideo: IVideo;
  videoRef?: RefObject<HTMLVideoElement | null>;
  isPortrait: boolean;
  childIngredients: IIngredient[];
  onSeeDetails?: (video: IVideo) => void;
  onShowChildren: () => void;
  onConvertToGif?: (video: IVideo) => void;
  onReverseVideo?: (video: IVideo) => void;
  onPortraitVideo?: (video: IVideo) => void;
  onMirrorVideo?: (video: IVideo) => void;
  onTrimVideo?: (video: IVideo) => void;
  onCloneVideo?: (video: IVideo) => void;
  onUpscaleVideo?: (video: IVideo) => void;
  onPublishVideo?: (video: IVideo, platform: string) => void;
  onGenerateCaptions?: (video: IVideo) => void;
  onAddTextOverlay?: (video: IVideo) => void;
  onShareVideo?: (video: IVideo) => void;
  onDownloadVideo?: (
    video: IVideo,
  ) => undefined | Promise<undefined | Window | null | undefined>;
  onCopyPrompt?: (video: IVideo) => void;
  onReprompt?: (video: IVideo) => void;
  onUsePrompt?: (video: IVideo) => void;
  isConverting?: boolean;
  isReversing?: boolean;
  isPortraiting?: boolean;
  isMirroring?: boolean;
  isTrimming?: boolean;
  isCloning?: boolean;
  isVoting?: boolean;
  isDownloading?: boolean;
  isUpscaling?: boolean;
  isPublishing?: boolean;
  isGeneratingCaptions?: boolean;
  isAddingTextOverlay?: boolean;
};

export default function VideoDetailFirstColumn({
  currentVideo,
  videoRef,
  isPortrait,
  childIngredients,
  onSeeDetails,
  onShowChildren,
  onConvertToGif,
  onReverseVideo,
  onPortraitVideo,
  onMirrorVideo,
  onTrimVideo,
  onCloneVideo,
  onUpscaleVideo,
  onPublishVideo,
  onGenerateCaptions,
  onAddTextOverlay,
  onShareVideo,
  onDownloadVideo,
  onCopyPrompt,
  onReprompt,
  onUsePrompt,
  isConverting,
  isReversing,
  isPortraiting,
  isMirroring,
  isTrimming,
  isCloning,
  isVoting,
  isDownloading,
  isUpscaling,
  isPublishing,
  isGeneratingCaptions,
  isAddingTextOverlay,
}: VideoDetailFirstColumnProps) {
  return (
    <div className="space-y-4">
      <div
        className={cn(
          'relative overflow-hidden shadow-lg group opacity-80 hover:opacity-100',
          'transition-opacity duration-300 max-h-[70vh] flex items-center justify-center w-fit mx-auto',
          isPortrait ? 'max-w-2xl' : 'max-w-4xl',
        )}
      >
        <VideoPlayer
          videoRef={videoRef}
          src={currentVideo.ingredientUrl}
          thumbnail={currentVideo.thumbnailUrl}
        />

        {currentVideo.status === IngredientStatus.PROCESSING && (
          <LoadingOverlay message="Processing video…" />
        )}
      </div>

      {/* Captioned Versions Quick Access */}
      {childIngredients && childIngredients.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground/80">
            Available Versions:
          </h4>

          <div className="flex flex-wrap gap-2">
            {childIngredients.reduce<ReactNode[]>((acc, child) => {
              if (
                child.transformations?.includes(
                  TransformationCategory.CAPTIONED,
                )
              ) {
                acc.push(
                  <Button
                    key={child.id}
                    withWrapper={false}
                    onClick={() => onSeeDetails?.(child as IVideo)}
                    variant={ButtonVariant.OUTLINE}
                    size={ButtonSize.SM}
                    ariaLabel={child.metadataLabel || 'Captioned Version'}
                  >
                    <span className="text-xs">
                      📝 {child.metadataLabel || 'Captioned Version'}
                    </span>
                  </Button>,
                );
              }
              return acc;
            }, [])}

            {childIngredients
              .filter(
                (child) =>
                  !child.transformations?.includes(
                    TransformationCategory.CAPTIONED,
                  ),
              )
              .slice(0, 3)
              .map((child) => (
                <Button
                  key={child.id}
                  withWrapper={false}
                  onClick={() => onSeeDetails?.(child as IVideo)}
                  variant={ButtonVariant.OUTLINE}
                  size={ButtonSize.SM}
                  ariaLabel={child.metadataLabel || `${child.category} Version`}
                >
                  <span className="text-xs">
                    {child.metadataLabel || `${child.category} Version`}
                  </span>
                </Button>
              ))}

            {childIngredients.length > 4 && (
              <Button
                withWrapper={false}
                onClick={onShowChildren}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                ariaLabel="View more versions"
              >
                <span className="text-xs">
                  +{childIngredients.length - 4} more
                </span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Edit in Video Editor */}
      <Link
        href={`/editor/new?video=${currentVideo.id}`}
        className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
      >
        <HiOutlineFilm className="size-4" />
        Edit in Video Editor
      </Link>

      {/* Quick Actions */}
      <IngredientQuickActions
        isAddingTextOverlay={isAddingTextOverlay}
        isCloning={isCloning}
        isConverting={isConverting}
        isDownloading={isDownloading}
        isGeneratingCaptions={isGeneratingCaptions}
        isMirroring={isMirroring}
        isPortraiting={isPortraiting}
        isPublishing={isPublishing}
        isReversing={isReversing}
        isTrimming={isTrimming}
        isUpscaling={isUpscaling}
        isVoting={isVoting}
        onAddTextOverlay={onAddTextOverlay}
        onClone={onCloneVideo}
        onConvertToGif={onConvertToGif}
        onDownload={onDownloadVideo}
        onGenerateCaptions={onGenerateCaptions}
        onMirror={onMirrorVideo}
        onPortrait={onPortraitVideo}
        onPublish={onPublishVideo}
        onReverse={onReverseVideo}
        onCopy={onCopyPrompt}
        onReprompt={onReprompt}
        onUsePrompt={onUsePrompt}
        onSeeDetails={onSeeDetails}
        onShare={onShareVideo}
        onTrim={onTrimVideo}
        onUpscale={onUpscaleVideo}
        // onVote={onVoteIngredient} // not needed right now
        selectedIngredient={currentVideo}
      />
    </div>
  );
}
