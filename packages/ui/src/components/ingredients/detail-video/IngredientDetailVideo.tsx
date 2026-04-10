'use client';

import type { IEvaluation } from '@genfeedai/client/models';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useEvaluation } from '@genfeedai/hooks/ui/evaluation/use-evaluation/use-evaluation';
import { useIngredientMetadata } from '@genfeedai/hooks/ui/ingredient/use-ingredient-metadata/use-ingredient-metadata';
import { useIngredientSharing } from '@genfeedai/hooks/ui/ingredient/use-ingredient-sharing/use-ingredient-sharing';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import type { ITag, IVideo } from '@genfeedai/interfaces';
import type { IngredientDetailVideoProps } from '@genfeedai/props/content/ingredient.props';
import type { TabItem } from '@genfeedai/props/ui/navigation/tabs.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import { WebSocketPaths } from '@genfeedai/utils/network/websocket.util';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import EvaluationCard from '@ui/evaluation/card/EvaluationCard';
import IngredientWorkspacePanel from '@ui/ingredients/detail/shared/IngredientWorkspacePanel';
import IngredientTabsCaptions from '@ui/ingredients/tabs/captions/IngredientTabsCaptions';
import IngredientTabsChildren from '@ui/ingredients/tabs/children/IngredientTabsChildren';
import IngredientTabsInfo from '@ui/ingredients/tabs/info/IngredientTabsInfo';
import IngredientTabsMetadata from '@ui/ingredients/tabs/metadata/IngredientTabsMetadata';
import IngredientTabsPosts from '@ui/ingredients/tabs/posts/IngredientTabsPosts';
import IngredientTabsPrompts from '@ui/ingredients/tabs/prompts/IngredientTabsPrompts';
import IngredientTabsSharing from '@ui/ingredients/tabs/sharing/IngredientTabsSharing';
import IngredientTabsTags from '@ui/ingredients/tabs/tags/IngredientTabsTags';
import LoadingOverlay from '@ui/loading/overlay/LoadingOverlay';
import { Button } from '@ui/primitives/button';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { HiOutlineFilm } from 'react-icons/hi2';

type VideoDetailTab =
  | 'info'
  | 'posts'
  | 'metadata'
  | 'prompts'
  | 'children'
  | 'captions'
  | 'tags'
  | 'sharing'
  | 'evaluation';

export default function IngredientDetailVideo({
  video,
  videoRef,
  onReload,
  childIngredients = [],
  // credentials = [],
  onConvertToGif,
  // onVoteIngredient,
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
  onSeeDetails,

  isConverting = false,
  isReversing = false,
  isPortraiting = false,
  isMirroring = false,
  isTrimming = false,
  isCloning = false,
  isVoting = false,
  isDownloading = false,
  isUpscaling = false,
  isPublishing = false,
  isGeneratingCaptions = false,
  isAddingTextOverlay = false,
  isUpdating = false,
}: IngredientDetailVideoProps) {
  const notificationsService = NotificationsService.getInstance();
  const { subscribe, isReady } = useSocketManager();

  const [currentVideo, setCurrentVideo] = useState<IVideo>(video);

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const handleRefreshMetadata = useCallback(async () => {
    // Reload the video data after metadata refresh
    try {
      const service = await getVideosService();
      const data = await service.findOne(currentVideo.id);

      setCurrentVideo(data);
      return data;
    } catch (error) {
      logger.error('Failed to reload video after metadata refresh', error);
      throw error;
    }
  }, [currentVideo.id, getVideosService]);

  // Use the shared metadata hook
  const { updateMetadata: updateMetadataHook } = useIngredientMetadata(
    currentVideo,
    (updated) => {
      setCurrentVideo(updated);
    },
    handleRefreshMetadata,
  );

  // Use the shared sharing hook
  const { updateSharing: updateSharingHook } = useIngredientSharing(
    currentVideo,
    (updated) => {
      setCurrentVideo(updated);
    },
  );

  const [tab, setTab] = useState<VideoDetailTab>('info');

  // Hook for AI quality evaluation (autoFetch disabled - evaluation comes with video)
  const {
    evaluation: newEvaluation,
    isEvaluating,
    evaluate,
  } = useEvaluation({
    autoFetch: false,
    contentId: video.id,
    contentType: IngredientCategory.VIDEO,
  });

  // Use evaluation from video (fetched with video) or newly created evaluation from hook
  // Cast to client model type for compatibility with EvaluationCard
  const evaluation: IEvaluation | undefined =
    newEvaluation ?? ((video as IVideo).evaluation as IEvaluation | undefined);

  useEffect(() => {
    setCurrentVideo(video);
  }, [video]);

  // Subscribe to video events (captions, merge, resize, etc.)
  useEffect(() => {
    if (!currentVideo?.id || !isReady) {
      return;
    }

    const videoEventPath = WebSocketPaths.video(currentVideo.id);

    const handleVideoEvent = (data: any) => {
      logger.info('Video event received:', data);

      if (data.status === WebSocketEventStatus.COMPLETED) {
        switch (data.eventType) {
          case WebSocketEventType.CAPTIONS_COMPLETED:
            notificationsService.success('Captions generated successfully!');
            break;

          case WebSocketEventType.VIDEO_MERGED:
            notificationsService.success('Videos merged successfully!');
            break;

          case WebSocketEventType.VIDEO_RESIZED:
            notificationsService.success('Video resized successfully!');
            break;

          case WebSocketEventType.VIDEO_REVERSED:
            notificationsService.success('Video reversed successfully!');
            break;

          case WebSocketEventType.VIDEO_MIRRORED:
            notificationsService.success('Video mirrored successfully!');
            break;

          case WebSocketEventType.VIDEO_TEXT_OVERLAY:
            notificationsService.success('Text overlay added successfully!');
            break;

          default:
            notificationsService.success('Video processing completed!');
        }

        // Reload the video data to get updated information
        if (onReload) {
          onReload();
        }
      } else if (data.status === WebSocketEventStatus.FAILED) {
        notificationsService.error('Video processing failed');
      }
    };

    const unsubscribe = subscribe(videoEventPath, handleVideoEvent);

    return () => {
      unsubscribe();
    };
  }, [currentVideo?.id, isReady, subscribe, onReload, notificationsService]);

  // Detect aspect ratio for smart layout
  const videoWidth = (currentVideo.metadata as any)?.width || 1920;
  const videoHeight = (currentVideo.metadata as any)?.height || 1920;
  const isPortrait = videoHeight > videoWidth;

  const tabs: TabItem[] = [
    {
      id: 'info',
      label: 'info',
    },
    {
      id: 'evaluation',
      label: 'quality',
    },
    {
      id: 'children',
      label: 'children',
    },
    ...(!currentVideo.transformations?.includes(
      TransformationCategory.CAPTIONED,
    )
      ? [
          {
            id: 'captions',
            label: 'captions',
          },
        ]
      : []),
    {
      id: 'sharing',
      label: 'sharing',
    },
    {
      id: 'posts',
      label: 'posts',
    },
    {
      id: 'metadata',
      label: 'metadata',
    },
    {
      id: 'prompts',
      label: 'prompts',
    },
  ];

  return (
    <>
      {/* Video Display - First Column */}
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
            <LoadingOverlay message="Processing video..." />
          )}
        </div>

        {/* Captioned Versions Quick Access */}
        {childIngredients && childIngredients.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground/80">
              Available Versions:
            </h4>

            <div className="flex flex-wrap gap-2">
              {childIngredients
                .filter((child) =>
                  child.transformations?.includes(
                    TransformationCategory.CAPTIONED,
                  ),
                )
                .map((child) => (
                  <Button
                    key={child.id}
                    withWrapper={false}
                    onClick={() => onSeeDetails?.(child)}
                    variant={ButtonVariant.OUTLINE}
                    size={ButtonSize.SM}
                    ariaLabel={child.metadataLabel || 'Captioned Version'}
                  >
                    <span className="text-xs">
                      📝 {child.metadataLabel || 'Captioned Version'}
                    </span>
                  </Button>
                ))}

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
                    onClick={() => onSeeDetails?.(child)}
                    variant={ButtonVariant.OUTLINE}
                    size={ButtonSize.SM}
                    ariaLabel={
                      child.metadataLabel || `${child.category} Version`
                    }
                  >
                    <span className="text-xs">
                      {child.metadataLabel || `${child.category} Version`}
                    </span>
                  </Button>
                ))}

              {childIngredients.length > 4 && (
                <Button
                  withWrapper={false}
                  onClick={() => setTab('children')}
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
          <HiOutlineFilm className="w-4 h-4" />
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

      {/* Details Panel - Second and Third Columns */}
      <div className="col-span-2 space-y-4">
        <IngredientWorkspacePanel
          title="Review video details"
          tabs={tabs}
          activeTab={tab}
          onTabChange={(nextTab) => setTab(nextTab as VideoDetailTab)}
        >
          {tab === 'info' && (
            <IngredientTabsInfo
              ingredient={currentVideo}
              isUpdating={isUpdating}
              onUpdateMetadata={updateMetadataHook}
            />
          )}

          {tab === 'evaluation' && (
            <EvaluationCard
              contentId={currentVideo.id}
              contentType={IngredientCategory.VIDEO}
              evaluation={evaluation ?? undefined}
              onEvaluate={async () => {
                await evaluate();
              }}
              isEvaluating={isEvaluating}
            />
          )}

          {tab === 'posts' && <IngredientTabsPosts ingredient={currentVideo} />}

          {tab === 'metadata' && (
            <IngredientTabsMetadata
              ingredient={currentVideo}
              onRefresh={async () => {
                await handleRefreshMetadata();
              }}
            />
          )}

          {tab === 'prompts' && (
            <IngredientTabsPrompts ingredient={currentVideo} />
          )}

          {tab === 'children' && (
            <IngredientTabsChildren
              ingredient={currentVideo}
              onViewChild={(child) => {
                logger.info('View child', { childId: child.id });
                if (onSeeDetails) {
                  onSeeDetails(child);
                }
              }}
            />
          )}

          {tab === 'captions' && (
            <IngredientTabsCaptions
              ingredient={currentVideo}
              onReload={onReload}
            />
          )}

          {tab === 'tags' && (
            <IngredientTabsTags
              ingredient={currentVideo}
              onTagsUpdate={(tags: ITag[]) => {
                logger.info('Tags updated', { tags });
                onReload?.(true);
              }}
            />
          )}

          {tab === 'sharing' && (
            <IngredientTabsSharing
              ingredient={currentVideo}
              onUpdateSharing={updateSharingHook}
              isUpdating={isUpdating}
            />
          )}
        </IngredientWorkspacePanel>

        {/* TO DO : ADD ADS CAMPAIGN LATER */}
        {/* <AdsCampaign contentType="video" /> */}
      </div>
    </>
  );
}
