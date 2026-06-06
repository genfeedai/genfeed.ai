'use client';

import type { IEvaluation } from '@genfeedai/client/models';
import {
  IngredientCategory,
  TransformationCategory,
  WebSocketEventStatus,
  WebSocketEventType,
} from '@genfeedai/enums';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useEvaluation } from '@genfeedai/hooks/ui/evaluation/use-evaluation/use-evaluation';
import { useIngredientMetadata } from '@genfeedai/hooks/ui/ingredient/use-ingredient-metadata/use-ingredient-metadata';
import { useIngredientSharing } from '@genfeedai/hooks/ui/ingredient/use-ingredient-sharing/use-ingredient-sharing';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import type { IVideo } from '@genfeedai/interfaces';
import type { IngredientDetailVideoProps } from '@genfeedai/props/content/ingredient.props';
import type { TabItem } from '@genfeedai/props/ui/navigation/tabs.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import { WebSocketPaths } from '@genfeedai/utils/network/websocket.util';
import { useCallback, useEffect, useState } from 'react';
import VideoDetailFirstColumn from './VideoDetailFirstColumn';
import VideoDetailWorkspacePanel from './VideoDetailWorkspacePanel';

const EMPTY_ARRAY: never[] = [];

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
  childIngredients = EMPTY_ARRAY,
  // credentials = EMPTY_ARRAY,
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
      <VideoDetailFirstColumn
        currentVideo={currentVideo}
        videoRef={videoRef}
        isPortrait={isPortrait}
        childIngredients={childIngredients}
        onSeeDetails={onSeeDetails}
        onShowChildren={() => setTab('children')}
        onConvertToGif={onConvertToGif}
        onReverseVideo={onReverseVideo}
        onPortraitVideo={onPortraitVideo}
        onMirrorVideo={onMirrorVideo}
        onTrimVideo={onTrimVideo}
        onCloneVideo={onCloneVideo}
        onUpscaleVideo={onUpscaleVideo}
        onPublishVideo={onPublishVideo}
        onGenerateCaptions={onGenerateCaptions}
        onAddTextOverlay={onAddTextOverlay}
        onShareVideo={onShareVideo}
        onDownloadVideo={onDownloadVideo}
        onCopyPrompt={onCopyPrompt}
        onReprompt={onReprompt}
        onUsePrompt={onUsePrompt}
        isConverting={isConverting}
        isReversing={isReversing}
        isPortraiting={isPortraiting}
        isMirroring={isMirroring}
        isTrimming={isTrimming}
        isCloning={isCloning}
        isVoting={isVoting}
        isDownloading={isDownloading}
        isUpscaling={isUpscaling}
        isPublishing={isPublishing}
        isGeneratingCaptions={isGeneratingCaptions}
        isAddingTextOverlay={isAddingTextOverlay}
      />

      {/* Details Panel - Second and Third Columns */}
      <VideoDetailWorkspacePanel
        currentVideo={currentVideo}
        tabs={tabs}
        tab={tab}
        onTabChange={setTab}
        isUpdating={isUpdating}
        evaluation={evaluation}
        isEvaluating={isEvaluating}
        onEvaluate={async () => {
          await evaluate();
        }}
        onReload={onReload}
        updateMetadataHook={updateMetadataHook}
        updateSharingHook={updateSharingHook}
        handleRefreshMetadata={handleRefreshMetadata}
        onSeeDetails={onSeeDetails}
      />
    </>
  );
}
